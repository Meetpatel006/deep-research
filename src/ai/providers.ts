import { getEncoding } from 'js-tiktoken';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { Message } from 'ai';
import pLimit from 'p-limit';

import { RecursiveCharacterTextSplitter } from './text-splitter';
import { colors, logWithTime, formatDuration, formatSize } from '../utils/logging';

// Configuration from environment variables
const CONFIG = {
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || ''
};

// Validate required environment variables
if (!CONFIG.GOOGLE_API_KEY) {
  throw new Error('GOOGLE_API_KEY environment variable is required');
}

// Initialize Google AI
const genAI = new GoogleGenerativeAI(CONFIG.GOOGLE_API_KEY);
logWithTime('🤖 Initialized Google Generative AI', colors.bright);

// Using Gemini 1.5 Pro for long context support
const DEFAULT_MODEL = 'gemini-1.5-pro';

// Rate limiting configuration - adjusted for better performance
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 3000; // 3 seconds
const MAX_RETRY_DELAY = 15000; // 15 seconds
const CONCURRENT_REQUESTS = 1; // Reduced to 1 to prevent rate limits
const rateLimiter = pLimit(CONCURRENT_REQUESTS);

// Helper function to delay execution with exponential backoff
const delay = (retryCount: number) => {
  const exponentialDelay = Math.min(
    INITIAL_RETRY_DELAY * Math.pow(2, retryCount),
    MAX_RETRY_DELAY
  );
  const jitter = Math.random() * 1000; // Add random jitter
  return new Promise(resolve => setTimeout(resolve, exponentialDelay + jitter));
};

// Update error handling for Google AI with retries
async function handleGoogleAIError(error: any, retryCount: number = 0): Promise<string> {
  if (error?.status === 429 && retryCount < MAX_RETRIES) {
    const nextDelay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
    logWithTime(`⚠️ Rate limit hit, retrying in ${formatDuration(nextDelay)}... (Attempt ${retryCount + 1}/${MAX_RETRIES})`, colors.yellow);
    await delay(retryCount);
    throw error; // Rethrow to trigger retry
  }
  logWithTime(`❌ Error: ${error.message || 'Unknown error'}`, colors.red);
  throw error;
}

// Convert AI SDK message to Google AI message format
function convertToGoogleAIMessages(messages: Message[]) {
  return messages.map(m => ({
    role: m.role === 'system' ? 'user' : m.role,
    parts: [{ text: m.content }]
  }));
}

// Model configuration types
interface ModelConfig {
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
    topK?: number;
    topP?: number;
    candidateCount?: number;
  };
  safetySettings: Array<{
    category: HarmCategory;
    threshold: HarmBlockThreshold;
  }>;
}

// Wrapper function for making API calls with retries
async function makeModelRequest(messages: Message[], config: ModelConfig) {
  return rateLimiter(async () => {
    let retryCount = 0;
    const startTime = Date.now();
    const inputSize = messages[messages.length - 1].content.length;
    
    logWithTime(`📤 Input size: ${formatSize(inputSize)} (${inputSize} chars)`, colors.cyan);
    
    while (retryCount <= MAX_RETRIES) {
      try {
        logWithTime(`🔄 Processing request...`, colors.cyan);
        
        const model = genAI.getGenerativeModel({ 
          model: DEFAULT_MODEL,
          ...config
        });
        const chat = model.startChat();
        const result = await chat.sendMessage(messages[messages.length - 1].content);
        const response = result.response.text();
        
        const duration = Date.now() - startTime;
        const outputSize = response.length;
        
        logWithTime(`✅ Request completed in ${formatDuration(duration)}`, colors.green);
        logWithTime(`📥 Output size: ${formatSize(outputSize)} (${outputSize} chars)`, colors.cyan);
        
        return response;
      } catch (error: any) {
        if (error?.status === 429 && retryCount < MAX_RETRIES) {
          retryCount++;
          await delay(retryCount);
          continue;
        }
        throw error;
      }
    }
    throw new Error('Max retries exceeded');
  });
}

// Base configuration for all models
const baseConfig: ModelConfig = {
  generationConfig: {
    temperature: 0.3,
    maxOutputTokens: 2048,
    topK: 40,
    topP: 0.95,
    candidateCount: 1,
  },
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ],
};

// For final report and complex analysis
export async function gpt4Model(messages: Message[]) {
  try {
    logWithTime('📝 Starting complex analysis...', colors.magenta);
    const config: ModelConfig = {
      ...baseConfig,
      generationConfig: {
        ...baseConfig.generationConfig,
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
    };
    
    const response = await makeModelRequest(messages, config);
    logWithTime('✨ Complex analysis completed', colors.magenta);
    return response;
  } catch (error: any) {
    return handleGoogleAIError(error);
  }
}

// For content processing and summarization
export async function gpt4MiniModel(messages: Message[]) {
  try {
    logWithTime('🔍 Starting content processing...', colors.blue);
    const config: ModelConfig = {
      ...baseConfig,
      generationConfig: {
        ...baseConfig.generationConfig,
        temperature: 0.5,
        maxOutputTokens: 4096,
      },
    };
    
    const response = await makeModelRequest(messages, config);
    logWithTime('✨ Content processing completed', colors.blue);
    return response;
  } catch (error: any) {
    return handleGoogleAIError(error);
  }
}

// For initial analysis and quick tasks
export async function o3MiniModel(messages: Message[]) {
  try {
    logWithTime('🚀 Starting quick analysis...', colors.cyan);
    const config: ModelConfig = {
      ...baseConfig,
      generationConfig: {
        ...baseConfig.generationConfig,
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    };
    
    const response = await makeModelRequest(messages, config);
    
    if (!response) {
      throw new Error('Empty or invalid response from Google AI');
    }
    
    logWithTime('✨ Quick analysis completed', colors.cyan);
    return response;
  } catch (error: any) {
    return handleGoogleAIError(error);
  }
}

// Context window configuration
const MinChunkSize = 2000;   // Increased for better context
const MaxContextSize = 2000000; // 2M tokens for Gemini 1.5 Pro
const encoder = getEncoding('o200k_base');

// trim prompt to maximum context size
export function trimPrompt(prompt: string, contextSize = MaxContextSize) {
  if (!prompt) {
    return '';
  }

  const length = encoder.encode(prompt).length;
  if (length <= contextSize) {
    return prompt;
  }

  logWithTime(`📊 Trimming prompt from ${formatSize(length)} tokens to ${formatSize(contextSize)} tokens...`, colors.yellow);
  
  const overflowTokens = length - contextSize;
  const chunkSize = prompt.length - overflowTokens * 3;
  if (chunkSize < MinChunkSize) {
    logWithTime('⚠️ Using minimum chunk size due to large overflow', colors.yellow);
    return prompt.slice(0, MinChunkSize);
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: 200, // Added overlap for better context
  });
  const trimmedPrompt = splitter.splitText(prompt)[0] ?? '';

  if (trimmedPrompt.length === prompt.length) {
    return trimPrompt(prompt.slice(0, chunkSize), contextSize);
  }

  logWithTime(`✂️ Prompt trimmed to ${formatSize(trimmedPrompt.length)} chars`, colors.green);
  return trimPrompt(trimmedPrompt, contextSize);
}
