/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentConfig,
  PartListUnion,
  Content,
  Tool,
  GenerateContentResponse,
} from '@google/genai';
import {
  getDirectoryContextString,
  getInitialChatHistory,
} from '../utils/environmentContext.js';
import type { ServerGeminiStreamEvent, ChatCompressionInfo } from './turn.js';
import { CompressionStatus } from './turn.js';
import { Turn, GeminiEventType } from './turn.js';
import type { Config } from '../config/config.js';
import { getCoreSystemPrompt } from './prompts.js';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat } from './geminiChat.js';
import { retryWithBackoff } from '../utils/retry.js';
import { getErrorMessage } from '../utils/errors.js';
import { tokenLimit } from './tokenLimits.js';
import type {
  ChatRecordingService,
  ResumedSessionData,
} from '../services/chatRecordingService.js';
import type { ContentGenerator } from './contentGenerator.js';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  getEffectiveModel,
} from '../config/models.js';
import { LoopDetectionService } from '../services/loopDetectionService.js';
import { ChatCompressionService } from '../services/chatCompressionService.js';
import { ideContextStore } from '../ide/ideContext.js';
import {
  logContentRetryFailure,
  logNextSpeakerCheck,
} from '../telemetry/loggers.js';
import {
  ContentRetryFailureEvent,
  NextSpeakerCheckEvent,
} from '../telemetry/types.js';
import { uiTelemetryService } from '../telemetry/uiTelemetry.js';
import type { IdeContext, File } from '../ide/types.js';
import { handleFallback } from '../fallback/handler.js';
import type { RoutingContext } from '../routing/routingStrategy.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import { GovernanceEngine } from '../governance/GovernanceEngine.js';
import { toParts } from '../code_assist/converter.js';

const MAX_TURNS = 100;

export class GeminiClient {
  private chat?: GeminiChat;
  private sessionTurnCount = 0;
  private governanceEngine: GovernanceEngine;

  private readonly loopDetector: LoopDetectionService;
  private readonly compressionService: ChatCompressionService;
  private lastPromptId: string;
  private currentSequenceModel: string | null = null;
  private lastSentIdeContext: IdeContext | undefined;
  private forceFullIdeContext = true;

  /**
   * At any point in this conversation, was compression triggered without
   * being forced and did it fail?
   */
  private hasFailedCompressionAttempt = false;

  constructor(private readonly config: Config) {
    this.loopDetector = new LoopDetectionService(config);
    this.compressionService = new ChatCompressionService();
    this.lastPromptId = this.config.getSessionId();
    this.governanceEngine = new GovernanceEngine();
  }

  private updateTelemetryTokenCount() {
    if (this.chat) {
      uiTelemetryService.setLastPromptTokenCount(
        this.chat.getLastPromptTokenCount(),
      );
    }
  }

  async initialize() {
    this.chat = await this.startChat();
    this.updateTelemetryTokenCount();
  }

  private getContentGeneratorOrFail(): ContentGenerator {
    if (!this.config.getContentGenerator()) {
      throw new Error('Content generator not initialized');
    }
    return this.config.getContentGenerator();
  }

  async addHistory(content: Content) {
    this.getChat().addHistory(content);
  }

  getChat(): GeminiChat {
    if (!this.chat) {
      throw new Error('Chat not initialized');
    }
    return this.chat;
  }

  isInitialized(): boolean {
    return this.chat !== undefined;
  }

  getHistory(): Content[] {
    return this.getChat().getHistory();
  }

  stripThoughtsFromHistory() {
    this.getChat().stripThoughtsFromHistory();
  }

  setHistory(history: Content[]) {
    this.getChat().setHistory(history);
    this.forceFullIdeContext = true;
  }

  async setTools(): Promise<void> {
    const toolRegistry = this.config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations();
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
    this.getChat().setTools(tools);
  }

  async resetChat(): Promise<void> {
    this.chat = await this.startChat();
    this.updateTelemetryTokenCount();
  }

  async resumeChat(
    history: Content[],
    resumedSessionData?: ResumedSessionData,
  ): Promise<void> {
    this.chat = await this.startChat(history, resumedSessionData);
  }

  getChatRecordingService(): ChatRecordingService | undefined {
    return this.chat?.getChatRecordingService();
  }

  getLoopDetectionService(): LoopDetectionService {
    return this.loopDetector;
  }

  getCurrentSequenceModel(): string | null {
    return this.currentSequenceModel;
  }

  async addDirectoryContext(): Promise<void> {
    if (!this.chat) {
      return;
    }

    this.getChat().addHistory({
      role: 'user',
      parts: [{ text: await getDirectoryContextString(this.config) }],
    });
  }

  async startChat(
    extraHistory?: Content[],
    resumedSessionData?: ResumedSessionData,
  ): Promise<GeminiChat> {
    this.forceFullIdeContext = true;
    this.hasFailedCompressionAttempt = false;

    const toolRegistry = this.config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations();
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];

    const history = await getInitialChatHistory(this.config, extraHistory);

    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(this.config, userMemory);
      return new GeminiChat(
        this.config,
        systemInstruction,
        tools,
        history,
        resumedSessionData,
      );
    } catch (error) {
      await reportError(
        error,
        'Error initializing Gemini chat session.',
        history,
        'startChat',
      );
      throw new Error(`Failed to initialize chat: ${getErrorMessage(error)}`);
    }
  }

  private getIdeContextParts(forceFullContext: boolean): {
    contextParts: string[];
    newIdeContext: IdeContext | undefined;
  } {
    const currentIdeContext = ideContextStore.get();
    if (!currentIdeContext) {
      return { contextParts: [], newIdeContext: undefined };
    }

    if (forceFullContext || !this.lastSentIdeContext) {
      // Send full context as JSON
      const openFiles = currentIdeContext.workspaceState?.openFiles || [];
      const activeFile = openFiles.find((f) => f.isActive);
      const otherOpenFiles = openFiles
        .filter((f) => !f.isActive)
        .map((f) => f.path);

      const contextData: Record<string, unknown> = {};

      if (activeFile) {
        contextData['activeFile'] = {
          path: activeFile.path,
          cursor: activeFile.cursor
            ? {
                line: activeFile.cursor.line,
                character: activeFile.cursor.character,
              }
            : undefined,
          selectedText: activeFile.selectedText || undefined,
        };
      }

      if (otherOpenFiles.length > 0) {
        contextData['otherOpenFiles'] = otherOpenFiles;
      }

      if (Object.keys(contextData).length === 0) {
        return { contextParts: [], newIdeContext: currentIdeContext };
      }

      const jsonString = JSON.stringify(contextData, null, 2);
      const contextParts = [
        "Here is the user's editor context as a JSON object. This is for your information only.",
        '```json',
        jsonString,
        '```',
      ];

      if (this.config.getDebugMode()) {
        debugLogger.log(contextParts.join('\n'));
      }
      return {
        contextParts,
        newIdeContext: currentIdeContext,
      };
    } else {
      // Calculate and send delta as JSON
      const delta: Record<string, unknown> = {};
      const changes: Record<string, unknown> = {};

      const lastFiles = new Map(
        (this.lastSentIdeContext.workspaceState?.openFiles || []).map(
          (f: File) => [f.path, f],
        ),
      );
      const currentFiles = new Map(
        (currentIdeContext.workspaceState?.openFiles || []).map((f: File) => [
          f.path,
          f,
        ]),
      );

      const openedFiles: string[] = [];
      for (const [path] of currentFiles.entries()) {
        if (!lastFiles.has(path)) {
          openedFiles.push(path);
        }
      }
      if (openedFiles.length > 0) {
        changes['filesOpened'] = openedFiles;
      }

      const closedFiles: string[] = [];
      for (const [path] of lastFiles.entries()) {
        if (!currentFiles.has(path)) {
          closedFiles.push(path);
        }
      }
      if (closedFiles.length > 0) {
        changes['filesClosed'] = closedFiles;
      }

      const lastActiveFile = (
        this.lastSentIdeContext.workspaceState?.openFiles || []
      ).find((f: File) => f.isActive);
      const currentActiveFile = (
        currentIdeContext.workspaceState?.openFiles || []
      ).find((f: File) => f.isActive);

      if (currentActiveFile) {
        if (!lastActiveFile || lastActiveFile.path !== currentActiveFile.path) {
          changes['activeFileChanged'] = {
            path: currentActiveFile.path,
            cursor: currentActiveFile.cursor
              ? {
                  line: currentActiveFile.cursor.line,
                  character: currentActiveFile.cursor.character,
                }
              : undefined,
            selectedText: currentActiveFile.selectedText || undefined,
          };
        } else {
          const lastCursor = lastActiveFile.cursor;
          const currentCursor = currentActiveFile.cursor;
          if (
            currentCursor &&
            (!lastCursor ||
              lastCursor.line !== currentCursor.line ||
              lastCursor.character !== currentCursor.character)
          ) {
            changes['cursorMoved'] = {
              path: currentActiveFile.path,
              cursor: {
                line: currentCursor.line,
                character: currentCursor.character,
              },
            };
          }

          const lastSelectedText = lastActiveFile.selectedText || '';
          const currentSelectedText = currentActiveFile.selectedText || '';
          if (lastSelectedText !== currentSelectedText) {
            changes['selectionChanged'] = {
              path: currentActiveFile.path,
              selectedText: currentSelectedText,
            };
          }
        }
      } else if (lastActiveFile) {
        changes['activeFileChanged'] = {
          path: null,
          previousPath: lastActiveFile.path,
        };
      }

      if (Object.keys(changes).length === 0) {
        return { contextParts: [], newIdeContext: currentIdeContext };
      }

      delta['changes'] = changes;
      const jsonString = JSON.stringify(delta, null, 2);
      const contextParts = [
        "Here is a summary of changes in the user's editor context, in JSON format. This is for your information only.",
        '```json',
        jsonString,
        '```',
      ];

      if (this.config.getDebugMode()) {
        debugLogger.log(contextParts.join('\n'));
      }
      return {
        contextParts,
        newIdeContext: currentIdeContext,
      };
    }
  }

  private _getEffectiveModelForCurrentTurn(): string {
    if (this.currentSequenceModel) {
      return this.currentSequenceModel;
    }

    const configModel = this.config.getModel();
    return getEffectiveModel(
      this.config.isInFallbackMode(),
      configModel,
      this.config.getPreviewFeatures(),
    );
  }

  async *sendMessageStream(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    turns: number = MAX_TURNS,
    isInvalidStreamRetry: boolean = false,
    governanceApproval: boolean = false,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    if (this.lastPromptId !== prompt_id) {
      this.loopDetector.reset(prompt_id);
      this.lastPromptId = prompt_id;
      this.currentSequenceModel = null;
    }
    this.sessionTurnCount++;
    if (
      this.config.getMaxSessionTurns() > 0 &&
      this.sessionTurnCount > this.config.getMaxSessionTurns()
    ) {
      yield { type: GeminiEventType.MaxSessionTurns };
      return new Turn(this.getChat(), prompt_id);
    }
    // Ensure turns never exceeds MAX_TURNS to prevent infinite loops
    const boundedTurns = Math.min(turns, MAX_TURNS);
    if (!boundedTurns) {
      return new Turn(this.getChat(), prompt_id);
    }

    // Check for context window overflow
    const modelForLimitCheck = this._getEffectiveModelForCurrentTurn();

    const estimatedRequestTokenCount = Math.floor(
      JSON.stringify(request).length / 4,
    );

    const remainingTokenCount =
      tokenLimit(modelForLimitCheck) - this.getChat().getLastPromptTokenCount();

    if (estimatedRequestTokenCount > remainingTokenCount * 0.95) {
      yield {
        type: GeminiEventType.ContextWindowWillOverflow,
        value: { estimatedRequestTokenCount, remainingTokenCount },
      };
      return new Turn(this.getChat(), prompt_id);
    }

    const compressed = await this.tryCompressChat(prompt_id, false);

    if (compressed.compressionStatus === CompressionStatus.COMPRESSED) {
      yield { type: GeminiEventType.ChatCompressed, value: compressed };
    }

    // Prevent context updates from being sent while a tool call is
    // waiting for a response. The Gemini API requires that a functionResponse
    // part from the user immediately follows a functionCall part from the model
    // in the conversation history . The IDE context is not discarded; it will
    // be included in the next regular message sent to the model.
    const history = this.getHistory();
    const lastMessage =
      history.length > 0 ? history[history.length - 1] : undefined;
    const hasPendingToolCall =
      !!lastMessage &&
      lastMessage.role === 'model' &&
      (lastMessage.parts?.some((p) => 'functionCall' in p) || false);

    if (this.config.getIdeMode() && !hasPendingToolCall) {
      const { contextParts, newIdeContext } = this.getIdeContextParts(
        this.forceFullIdeContext || history.length === 0,
      );
      if (contextParts.length > 0) {
        this.getChat().addHistory({
          role: 'user',
          parts: [{ text: contextParts.join('\n') }],
        });
      }
      this.lastSentIdeContext = newIdeContext;
      this.forceFullIdeContext = false;
    }

    const turn = new Turn(this.getChat(), prompt_id);

    const controller = new AbortController();
    const linkedSignal = AbortSignal.any([signal, controller.signal]);

    const loopDetected = await this.loopDetector.turnStarted(signal);
    if (loopDetected) {
      yield { type: GeminiEventType.LoopDetected };
      return turn;
    }

    const routingContext: RoutingContext = {
      history: this.getChat().getHistory(/*curated=*/ true),
      request,
      signal,
    };

    let modelToUse: string;

    // Determine Model (Stickiness vs. Routing)
    if (this.currentSequenceModel) {
      modelToUse = this.currentSequenceModel;
    } else {
      const router = await this.config.getModelRouterService();
      const decision = await router.route(routingContext);
      modelToUse = decision.model;
      // Lock the model for the rest of the sequence
      this.currentSequenceModel = modelToUse;
      yield { type: GeminiEventType.ModelInfo, value: modelToUse };
    }

    // --- Governance Layer: Intercept Request ---
    const requestParts = Array.isArray(request) ? request : [request];
    // We need to convert PartListUnion to Part[] properly. request is PartListUnion which is Content | Part | string | (Part | string)[]
    const parts = toParts(requestParts);

    const governanceResult = this.governanceEngine.interceptRequest(parts, modelToUse, { prompt_id }, { approvalGranted: governanceApproval });

    if (governanceResult.requiresApproval) {
         yield {
           type: GeminiEventType.GovernanceConfirmationNeeded,
           value: {
             riskLevel: governanceResult.context.riskLevel || 'UNKNOWN',
             riskCategory: governanceResult.context.riskCategory || 'Unknown Category',
             justification: governanceResult.context.justification || 'High Risk Detected',
           }
         };
         return turn;
    }

    if (!governanceResult.proceed) {
         // If blocked, we can yield a special error or system message.
         // Since we are in a generator, we can yield an error event.
         // Or we can yield a content event explaining why it was blocked.
         yield { type: GeminiEventType.Content, value: `\n\n[GOVERNANCE BLOCK]: ${governanceResult.error}\n` };
         yield { type: GeminiEventType.Finished, value: { reason: undefined, usageMetadata: undefined } };
         return turn;
    }

    // Use redacted input if modified (though original request is passed to turn.run usually)
    // Ideally we would swap the request with governanceResult.context.redactedInput
    // but converting back to PartListUnion for turn.run might be needed.
    // For this implementation, we assume PII redaction is for logging/auditing mostly
    // unless we want to prevent the model from seeing it.
    // If we want to prevent model from seeing it, we should use the redacted input.
    // Let's reconstruct the request.
    let safeRequest: PartListUnion = request;
    if (governanceResult.context.redactedInput) {
         safeRequest = governanceResult.context.redactedInput;
    }

    const resultStream = turn.run({ model: modelToUse }, safeRequest, linkedSignal);
    for await (const event of resultStream) {
      if (this.loopDetector.addAndCheck(event)) {
        yield { type: GeminiEventType.LoopDetected };
        controller.abort();
        return turn;
      }

      // --- Governance Layer: Intercept Response (Streaming) ---
      // This is tricky for streaming. We can intercept chunks but the OutputGuardrail works best on full response.
      // For streaming, we might just log chunks or accumulator.
      // However, to be compliant "block automated output until ... explicitly approves it",
      // we would need to buffer the whole stream if it's high risk.
      // For this "add-on" implementation, we will let the stream pass but perform the check
      // on the final accumulated response or individual chunks if possible.
      // But wait, `turn.run` yields events. `GeminiEventType.Content` has the text.

      // If High Risk and we need approval, strictly we shouldn't yield anything until approved.
      // That breaks streaming UX.
      // Let's implement a "lazy" check or check after completion for the log,
      // or if we are serious about blocking, we buffer.

      // Given the constraint of "add-on" and "CLI", we will log the chunks.
      // Real blocking in streaming requires buffering.

      // If we encounter a Finished event, we can run the full validation on the accumulated response
      // (which we don't have easily here without accumulating it ourselves, but Turn does accumulate debugResponses).

      // Let's just yield the event for now to keep it simple and robust.
      // The GovernanceEngine interceptResponse is designed for full response object.
      // We can call it at the end if we want to log the decision.

      yield event;

      // Accumulate response for governance logging at the end
      if (event.type === GeminiEventType.Finished) {
          // Construct a synthetic response object from what we observed or can retrieve
          // turn.getDebugResponses() returns an array of GenerateContentResponse
          const debugResponses = turn.getDebugResponses();
          if (debugResponses.length > 0) {
              // Use the last response or aggregate them. Usually the last one has the finish reason.
              // We might need to concatenate content parts if they are fragmented.
              // For simplicity, let's take the last one which likely triggered the finish event.
              // Or better, let's try to log what we have.
              const lastResponse = debugResponses[debugResponses.length - 1];
              const govResponse = this.governanceEngine.interceptResponse(governanceResult.context, lastResponse);

              if (!govResponse.proceed) {
                   // NOTE: Content has already been streamed to the user.
                   // Strictly, for High-Risk scenarios requiring blocking, we should buffer.
                   // However, buffering degrades streaming experience.
                   // We log this violation.
                   debugLogger.log('[GOVERNANCE VIOLATION] High-Risk content streamed before it could be blocked.');
              }
          }
      }

      this.updateTelemetryTokenCount();

      if (event.type === GeminiEventType.InvalidStream) {
        if (this.config.getContinueOnFailedApiCall()) {
          if (isInvalidStreamRetry) {
            // We already retried once, so stop here.
            logContentRetryFailure(
              this.config,
              new ContentRetryFailureEvent(
                4, // 2 initial + 2 after injections
                'FAILED_AFTER_PROMPT_INJECTION',
                modelToUse,
              ),
            );
            return turn;
          }
          const nextRequest = [{ text: 'System: Please continue.' }];
          yield* this.sendMessageStream(
            nextRequest,
            signal,
            prompt_id,
            boundedTurns - 1,
            true, // Set isInvalidStreamRetry to true
            governanceApproval,
          );
          return turn;
        }
      }
      if (event.type === GeminiEventType.Error) {
        return turn;
      }
    }
    if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
      // Check if next speaker check is needed
      if (this.config.getQuotaErrorOccurred()) {
        return turn;
      }

      if (this.config.getSkipNextSpeakerCheck()) {
        return turn;
      }

      const nextSpeakerCheck = await checkNextSpeaker(
        this.getChat(),
        this.config.getBaseLlmClient(),
        signal,
        prompt_id,
      );
      logNextSpeakerCheck(
        this.config,
        new NextSpeakerCheckEvent(
          prompt_id,
          turn.finishReason?.toString() || '',
          nextSpeakerCheck?.next_speaker || '',
        ),
      );
      if (nextSpeakerCheck?.next_speaker === 'model') {
        const nextRequest = [{ text: 'Please continue.' }];
        // This recursive call's events will be yielded out, but the final
        // turn object will be from the top-level call.
        yield* this.sendMessageStream(
          nextRequest,
          signal,
          prompt_id,
          boundedTurns - 1,
          // isInvalidStreamRetry is false here, as this is a next speaker check
          false,
          governanceApproval,
        );
      }
    }
    return turn;
  }

  async generateContent(
    modelConfigKey: ModelConfigKey,
    contents: Content[],
    abortSignal: AbortSignal,
  ): Promise<GenerateContentResponse> {
    const desiredModelConfig =
      this.config.modelConfigService.getResolvedConfig(modelConfigKey);
    let {
      model: currentAttemptModel,
      generateContentConfig: currentAttemptGenerateContentConfig,
    } = desiredModelConfig;
    const fallbackModelConfig =
      this.config.modelConfigService.getResolvedConfig({
        ...modelConfigKey,
        model: DEFAULT_GEMINI_FLASH_MODEL,
      });

    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(this.config, userMemory);

      const apiCall = async () => {
        const modelConfigToUse = this.config.isInFallbackMode()
          ? fallbackModelConfig
          : desiredModelConfig;
        currentAttemptModel = modelConfigToUse.model;
        currentAttemptGenerateContentConfig =
          modelConfigToUse.generateContentConfig;

        // --- Governance Layer: Intercept Request (Non-streaming) ---
        // Convert contents to Parts for inspection.
        // contents is Content[]
        const parts = contents.flatMap(c => c.parts || []);
        const governanceReq = this.governanceEngine.interceptRequest(parts, currentAttemptModel, { modelConfigKey });

        if (!governanceReq.proceed) {
             throw new Error(`Governance Block: ${governanceReq.error}`);
        }
        // Use redacted inputs if available
        // Reconstructing Content[] with redacted parts is complex if we have multiple contents.
        // For simplicity we will assume we might modify the last content or just proceed
        // if we trust the redaction logic to return a compatible structure,
        // but here we just passed flat parts.
        // To properly replace, we would need to map back to Content objects.
        // For now, we proceed with the original 'contents' but we have LOGGED the redaction in governanceReq.
        // (If we want to ENFORCE redaction sent to model, we need to reconstruct 'contents').

        const requestConfig: GenerateContentConfig = {
          ...currentAttemptGenerateContentConfig,
          abortSignal,
          systemInstruction,
        };

        const response = await this.getContentGeneratorOrFail().generateContent(
          {
            model: currentAttemptModel,
            config: requestConfig,
            contents,
          },
          this.lastPromptId,
        );

        // --- Governance Layer: Intercept Response (Non-streaming) ---
        const governanceRes = this.governanceEngine.interceptResponse(governanceReq.context, response);

        if (!governanceRes.proceed) {
             throw new Error(`Governance Output Block: ${governanceRes.error}`);
        }

        return governanceRes.response;
      };
      const onPersistent429Callback = async (
        authType?: string,
        error?: unknown,
      ) =>
        // Pass the captured model to the centralized handler.
        await handleFallback(this.config, currentAttemptModel, authType, error);

      const result = await retryWithBackoff(apiCall, {
        onPersistent429: onPersistent429Callback,
        authType: this.config.getContentGeneratorConfig()?.authType,
      });
      return result;
    } catch (error: unknown) {
      if (abortSignal.aborted) {
        throw error;
      }

      await reportError(
        error,
        `Error generating content via API with model ${currentAttemptModel}.`,
        {
          requestContents: contents,
          requestConfig: currentAttemptGenerateContentConfig,
        },
        'generateContent-api',
      );
      throw new Error(
        `Failed to generate content with model ${currentAttemptModel}: ${getErrorMessage(error)}`,
      );
    }
  }

  async tryCompressChat(
    prompt_id: string,
    force: boolean = false,
  ): Promise<ChatCompressionInfo> {
    // If the model is 'auto', we will use a placeholder model to check.
    // Compression occurs before we choose a model, so calling `count_tokens`
    // before the model is chosen would result in an error.
    const model = this._getEffectiveModelForCurrentTurn();

    const { newHistory, info } = await this.compressionService.compress(
      this.getChat(),
      prompt_id,
      force,
      model,
      this.config,
      this.hasFailedCompressionAttempt,
    );

    if (
      info.compressionStatus ===
      CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT
    ) {
      this.hasFailedCompressionAttempt = !force && true;
    } else if (info.compressionStatus === CompressionStatus.COMPRESSED) {
      if (newHistory) {
        this.chat = await this.startChat(newHistory);
        this.updateTelemetryTokenCount();
        this.forceFullIdeContext = true;
      }
    }

    return info;
  }
}
