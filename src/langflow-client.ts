import { EventSourcePolyfill as EventSource } from 'event-source-polyfill';

interface Tweaks {
  [key: string]: Record<string, unknown>;
}

interface StreamData {
  chunk: string;
}

// Configuration from environment variables
const CONFIG = {
  FLOW_ID: process.env.LANGFLOW_FLOW_ID || '',
  LANGFLOW_ID: process.env.LANGFLOW_ID || '',
  APPLICATION_TOKEN: process.env.LANGFLOW_API_KEY || '',
  BASE_URL: process.env.LANGFLOW_BASE_URL || 'https://api.langflow.astra.datastax.com'
};

// Validate required environment variables
if (!CONFIG.FLOW_ID || !CONFIG.LANGFLOW_ID || !CONFIG.APPLICATION_TOKEN) {
  throw new Error('Missing required Langflow environment variables. Please check your .env file.');
}

// Default tweaks configuration
const DEFAULT_TWEAKS: Tweaks = {
  "Prompt-NgyC1": {},
  "Prompt-11bWP": {},
  "Prompt-0PimN": {},
  "Prompt-fBKHG": {},
  "GroqModel-kM5jX": {},
  "GroqModel-r8JSC": {},
  "TavilySearchComponent-GKBcb": {},
  "GoogleGenerativeAIModel-peVoo": {},
  "ChatOutput-YcWuE": {},
  "ChatInput-xHtE0": {}
};

export class LangflowClient {
  private baseURL: string;
  private applicationToken: string;

  constructor(baseURL: string, applicationToken: string) {
    this.baseURL = baseURL;
    this.applicationToken = applicationToken;
  }

  async post(endpoint: string, body: unknown, headers: Record<string, string> = {}): Promise<any> {
    headers["Authorization"] = `Bearer ${this.applicationToken}`;
    headers["Content-Type"] = "application/json";
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });

      const responseMessage = await response.json();
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} - ${JSON.stringify(responseMessage)}`);
      }
      return responseMessage;
    } catch (error) {
      if (error instanceof Error) {
        console.error('Request Error:', error.message);
      }
      throw error;
    }
  }

  async initiateSession(
    flowId: string,
    langflowId: string,
    inputValue: string,
    inputType: string = 'chat',
    outputType: string = 'chat',
    stream: boolean = false,
    tweaks: Tweaks = {}
  ): Promise<any> {
    const endpoint = `/lf/${langflowId}/api/v1/run/${flowId}?stream=${stream}`;
    return this.post(endpoint, {
      input_value: inputValue,
      input_type: inputType,
      output_type: outputType,
      tweaks: tweaks
    });
  }

  handleStream(
    streamUrl: string,
    onUpdate: (data: StreamData) => void,
    onClose: (message: string) => void,
    onError: (error: Error) => void
  ): EventSource {
    const eventSource = new EventSource(streamUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StreamData;
        onUpdate(data);
      } catch (error) {
        if (error instanceof Error) {
          onError(error);
        }
      }
    };

    eventSource.onerror = (event) => {
      const error = new Error('Stream error occurred');
      console.error('Stream Error:', event);
      onError(error);
      eventSource.close();
    };

    eventSource.addEventListener("close", () => {
      onClose('Stream closed');
      eventSource.close();
    });

    return eventSource;
  }

  async runFlow(
    flowIdOrName: string,
    langflowId: string,
    inputValue: string,
    inputType: string = 'chat',
    outputType: string = 'chat',
    tweaks: Tweaks = {},
    stream: boolean = false,
    onUpdate?: (data: StreamData) => void,
    onClose?: (message: string) => void,
    onError?: (error: Error) => void
  ): Promise<any> {
    try {
      const response = await this.initiateSession(
        flowIdOrName,
        langflowId,
        inputValue,
        inputType,
        outputType,
        stream,
        tweaks
      );

      console.log('Raw Response:', response);

      if (stream && 
          response?.stream_url &&
          onUpdate && onClose && onError) {
        console.log(`Streaming from: ${response.stream_url}`);
        this.handleStream(response.stream_url, onUpdate, onClose, onError);
      }

      return response;
    } catch (error) {
      console.error('Error running flow:', error);
      if (onError && error instanceof Error) onError(error);
      throw error;
    }
  }
}

export async function runLangflowQuery(
  inputValue: string,
  inputType: string = 'chat',
  outputType: string = 'chat',
  stream: boolean = false
): Promise<string> {
  const langflowClient = new LangflowClient(CONFIG.BASE_URL, CONFIG.APPLICATION_TOKEN);

  try {
    const response = await langflowClient.runFlow(
      CONFIG.FLOW_ID,
      CONFIG.LANGFLOW_ID,
      inputValue,
      inputType,
      outputType,
      DEFAULT_TWEAKS,
      stream,
      (data) => console.log("Received:", data.chunk),
      (message) => console.log("Stream Closed:", message),
      (error) => console.log("Stream Error:", error.message)
    );

    // Extract the text content from the response
    const text = response?.outputs?.[0]?.outputs?.[0]?.results?.message?.data?.text;
    if (text) {
      return text;
    }
    
    // If we can't find the text in the expected structure, return the full response
    return JSON.stringify(response, null, 2);
  } catch (error) {
    console.error('Langflow Query Error:', error);
    throw error;
  }
} 