import { Message } from 'ai';
import { o3MiniModel } from './ai/providers';
import { systemPrompt } from './prompt';
import { colors, logWithTime } from './utils/logging';

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

export async function generateFeedback({
  query,
  numQuestions = 3,
}: {
  query: string;
  numQuestions?: number;
}): Promise<string[]> {
  logWithTime('🤔 Generating clarifying questions...', colors.cyan);
  
  const prompt = `Please analyze the following query and generate follow-up questions to clarify the research direction. Format your response as a JSON object with a "questions" array containing the follow-up questions.

Query: ${query}

Maximum number of questions: ${numQuestions}

Important: Return ONLY the JSON object without any markdown formatting or code blocks.

Example format:
{
  "questions": [
    "question 1",
    "question 2",
    "question 3"
  ]
}`;

  try {
    logWithTime(`📝 Analyzing query: "${query}"`, colors.blue);
    const content = await o3MiniModel(formatMessages(systemPrompt(), prompt));
    
    if (!content) {
      logWithTime('❌ Empty response from Google AI', colors.red);
      return [];
    }

    try {
      // Clean and parse the content
      const cleanedContent = cleanJsonResponse(content);
      const parsed = JSON.parse(cleanedContent) as { questions: string[] };
      const questions = parsed.questions.slice(0, numQuestions);
      
      logWithTime(`✅ Generated ${questions.length} questions`, colors.green);
      questions.forEach((q, i) => {
        logWithTime(`   ${i + 1}. ${q}`, colors.dim);
      });
      
      return questions;
    } catch (parseError) {
      logWithTime('⚠️ Failed to parse JSON response, attempting regex extraction...', colors.yellow);
      // If JSON parsing fails, try to extract questions using regex
      const questions = content.match(/["']([^"']+\?)["']/g)
        ?.map((q: string) => q.replace(/["']/g, ''))
        ?.filter((q: string) => q.trim().endsWith('?'))
        ?.slice(0, numQuestions) || [];
      
      if (questions.length > 0) {
        logWithTime(`✅ Extracted ${questions.length} questions using regex`, colors.green);
        questions.forEach((q, i) => {
          logWithTime(`   ${i + 1}. ${q}`, colors.dim);
        });
        return questions;
      }
      
      logWithTime('❌ Failed to extract questions using regex', colors.red);
      throw parseError;
    }
  } catch (error: any) {
    logWithTime(`❌ Error generating feedback: ${error.message || 'Unknown error'}`, colors.red);
    return [];
  }
}
