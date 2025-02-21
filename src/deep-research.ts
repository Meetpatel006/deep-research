import FirecrawlApp, { SearchResponse } from '@mendable/firecrawl-js';
import { compact } from 'lodash-es';
import pLimit from 'p-limit';
import { z } from 'zod';
import { Message } from 'ai';

import { o3MiniModel, trimPrompt } from './ai/providers';
import { systemPrompt } from './prompt';

// Configuration from environment variables
const CONFIG = {
  FIRECRAWL_KEY: process.env.FIRECRAWL_KEY || '',
  FIRECRAWL_BASE_URL: process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev'
};

// Validate required environment variables
if (!CONFIG.FIRECRAWL_KEY) {
  throw new Error('FIRECRAWL_KEY environment variable is required');
}

type ResearchResult = {
  learnings: string[];
  visitedUrls: string[];
};

type SerpQuery = {
  query: string;
  researchGoal: string;
};

type ProcessResult = {
  learnings: string[];
  followUpQuestions: string[];
};

// increase this if you have higher API rate limits
const ConcurrencyLimit = 2;

// Initialize Firecrawl with proper error handling
let firecrawl: FirecrawlApp;
try {
  firecrawl = new FirecrawlApp({
    apiKey: CONFIG.FIRECRAWL_KEY,
    apiUrl: CONFIG.FIRECRAWL_BASE_URL
  });
} catch (error) {
  console.error('Failed to initialize Firecrawl:', error);
  throw error;
}

// Helper function to format messages for Google AI
function formatMessages(system: string, prompt: string): Message[] {
  return [
    { role: 'system', content: system, id: 'system' },
    { role: 'user', content: prompt, id: 'user' }
  ];
}

// Helper function to clean JSON response
function cleanJsonResponse(content: string): string {
  // Remove markdown code block markers
  content = content.replace(/```json\n/g, '').replace(/```\n/g, '').replace(/```/g, '');
  // Clean whitespace
  content = content.trim().replace(/\n+/g, ' ').replace(/\s+/g, ' ');
  return content;
}

// take en user query, return a list of SERP queries
async function generateSerpQueries({
  query,
  numQueries = 3,
  learnings,
}: {
  query: string;
  numQueries?: number;
  learnings?: string[];
}): Promise<SerpQuery[]> {
  const prompt = `Please analyze the following prompt and generate SERP queries for research. Format your response as a JSON object containing an array of queries.

Prompt: ${query}

${learnings ? `Previous learnings:\n${learnings.join('\n')}` : ''}

Maximum queries: ${numQueries}

Important: Return ONLY the JSON object without any markdown formatting or code blocks.

Example format:
{
  "queries": [
    {
      "query": "specific search query 1",
      "researchGoal": "detailed explanation of what this query aims to find"
    }
  ]
}`;

  try {
    const content = await o3MiniModel(formatMessages(systemPrompt(), prompt));
    
    if (!content) {
      console.error('Empty response from Google AI');
      return [];
    }

    try {
      const cleanedContent = cleanJsonResponse(content);
      const parsed = JSON.parse(cleanedContent) as { queries: SerpQuery[] };
      console.log(`Created ${parsed.queries.length} queries`, parsed.queries);
      return parsed.queries.slice(0, numQueries);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', content);
      return [];
    }
  } catch (error: any) {
    console.error('Error generating SERP queries:', error);
    return [];
  }
}

async function processSerpResult({
  query,
  result,
  numLearnings = 3,
  numFollowUpQuestions = 3,
}: {
  query: string;
  result: SearchResponse;
  numLearnings?: number;
  numFollowUpQuestions?: number;
}): Promise<ProcessResult> {
  const contents = compact(result.data.map(item => item.markdown)).map(
    content => trimPrompt(content, 25_000),
  );
  console.log(`Ran ${query}, found ${contents.length} contents`);

  const prompt = `Please analyze the following search results and generate learnings and follow-up questions. Format your response as a JSON object.

Search Query: ${query}

Contents:
${contents.map(content => `---\n${content}\n---`).join('\n')}

Maximum learnings: ${numLearnings}
Maximum follow-up questions: ${numFollowUpQuestions}

Important: Return ONLY the JSON object without any markdown formatting or code blocks.

Example format:
{
  "learnings": [
    "detailed learning point 1",
    "detailed learning point 2"
  ],
  "followUpQuestions": [
    "specific follow-up question 1",
    "specific follow-up question 2"
  ]
}`;

  try {
    const content = await o3MiniModel(formatMessages(systemPrompt(), prompt));

    if (!content) {
      console.error('Empty response from Google AI');
      return { learnings: [], followUpQuestions: [] };
    }

    try {
      const cleanedContent = cleanJsonResponse(content);
      const parsed = JSON.parse(cleanedContent) as ProcessResult;
      console.log(`Created ${parsed.learnings.length} learnings`, parsed.learnings);
      return {
        learnings: parsed.learnings.slice(0, numLearnings),
        followUpQuestions: parsed.followUpQuestions.slice(0, numFollowUpQuestions)
      };
    } catch (parseError) {
      console.error('Failed to parse JSON response:', content);
      return { learnings: [], followUpQuestions: [] };
    }
  } catch (error: any) {
    console.error('Error processing SERP results:', error);
    return { learnings: [], followUpQuestions: [] };
  }
}

export async function writeFinalReport({
  prompt,
  learnings,
  visitedUrls,
}: {
  prompt: string;
  learnings: string[];
  visitedUrls: string[];
}): Promise<string> {
  const learningsString = trimPrompt(
    learnings.map(learning => `- ${learning}`).join('\n'),
    150_000,
  );

  const promptText = `Please write a detailed research report based on the following information. Format your response as a JSON object containing the report in markdown format.

Research Topic: ${prompt}

Key Findings:
${learningsString}

Important: Return ONLY the JSON object without any markdown formatting or code blocks.

Example format:
{
  "reportMarkdown": "# Research Report\n\n[Your detailed report here in markdown format]"
}`;

  try {
    const content = await o3MiniModel(formatMessages(systemPrompt(), promptText));

    if (!content) {
      console.error('Empty response from Google AI');
      return 'Error: Could not generate report';
    }

    try {
      const cleanedContent = cleanJsonResponse(content);
      const parsed = JSON.parse(cleanedContent) as { reportMarkdown: string };
      const urlsSection = `\n\n## Sources\n\n${visitedUrls.map(url => `- ${url}`).join('\n')}`;
      return parsed.reportMarkdown + urlsSection;
    } catch (parseError) {
      console.error('Failed to parse JSON response:', content);
      // If JSON parsing fails, try to use the content directly if it looks like markdown
      if (content.includes('#') || content.includes('##')) {
        return content + `\n\n## Sources\n\n${visitedUrls.map(url => `- ${url}`).join('\n')}`;
      }
      return 'Error: Could not parse report';
    }
  } catch (error: any) {
    console.error('Error generating final report:', error);
    return 'Error: Could not generate report';
  }
}

export async function deepResearch({
  query,
  breadth,
  depth,
  learnings = [],
  visitedUrls = [],
}: {
  query: string;
  breadth: number;
  depth: number;
  learnings?: string[];
  visitedUrls?: string[];
}): Promise<ResearchResult> {
  const serpQueries = await generateSerpQueries({
    query,
    learnings,
    numQueries: breadth,
  });
  const limit = pLimit(ConcurrencyLimit);

  const results = await Promise.all(
    serpQueries.map(serpQuery =>
      limit(async () => {
        try {
          console.log(`Searching for: ${serpQuery.query}`);
          const result = await firecrawl.search(serpQuery.query, {
            timeout: 30000, // 30 seconds timeout
            limit: 5,
            scrapeOptions: { 
              formats: ['markdown'],
              timeout: 20000 // 20 seconds timeout for scraping
            },
            retries: 2 // Retry failed requests twice
          });

          // Collect URLs from this search
          const newUrls = compact(result.data.map(item => item.url));
          const newBreadth = Math.ceil(breadth / 2);
          const newDepth = depth - 1;

          const newLearnings = await processSerpResult({
            query: serpQuery.query,
            result,
            numFollowUpQuestions: newBreadth,
          });
          const allLearnings = [...learnings, ...newLearnings.learnings];
          const allUrls = [...visitedUrls, ...newUrls];

          if (newDepth > 0) {
            console.log(
              `Researching deeper, breadth: ${newBreadth}, depth: ${newDepth}`,
            );

            const nextQuery = `
            Previous research goal: ${serpQuery.researchGoal}
            Follow-up research directions: ${newLearnings.followUpQuestions.map(q => `\n${q}`).join('')}
          `.trim();

            return deepResearch({
              query: nextQuery,
              breadth: newBreadth,
              depth: newDepth,
              learnings: allLearnings,
              visitedUrls: allUrls,
            });
          } else {
            return {
              learnings: allLearnings,
              visitedUrls: allUrls,
            };
          }
        } catch (e: any) {
          console.error(`Error running query "${serpQuery.query}":`, e);
          if (e.statusCode === 429) {
            console.error('Rate limit exceeded. Please wait before trying again.');
          } else if (e.statusCode === 401) {
            console.error('Invalid API key. Please check your FIRECRAWL_KEY.');
          } else if (e.statusCode === 404) {
            console.error('No results found for this query.');
          } else if (e.message.includes('ENOTFOUND')) {
            console.error('Network error: Could not connect to Firecrawl API. Please check your internet connection.');
          }
          return {
            learnings: [],
            visitedUrls: [],
          };
        }
      }),
    ),
  );

  const filteredResults = results.filter(r => r.learnings.length > 0 || r.visitedUrls.length > 0);
  if (filteredResults.length === 0) {
    console.log('No valid results found. You may want to:');
    console.log('1. Check your internet connection');
    console.log('2. Verify your Firecrawl API key');
    console.log('3. Try different search queries');
    console.log('4. Increase the timeout values if needed');
  }

  return {
    learnings: [...new Set(results.flatMap(r => r.learnings))],
    visitedUrls: [...new Set(results.flatMap(r => r.visitedUrls))],
  };
}
