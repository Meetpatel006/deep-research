// Suppress punycode deprecation warning
process.removeAllListeners('warning');

import * as fs from 'fs/promises';
import * as readline from 'readline';

import { deepResearch, writeFinalReport } from './deep-research';
import { generateFeedback } from './feedback';
import { colors, logWithTime, formatDuration } from './utils/logging';
import { runLangflowQuery } from './langflow-client';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Helper function to get user input
function askQuestion(query: string): Promise<string> {
  return new Promise(resolve => {
    process.stdout.write(`${colors.cyan}${query}${colors.reset}`);
    rl.once('line', answer => {
      resolve(answer);
    });
  });
}

async function runDeepSearch() {
  const startTime = Date.now();
  
  try {
    logWithTime('🔍 Starting Deep Research...', colors.bright);
    
    // Get initial query
    const initialQuery = await askQuestion('What would you like to research? ');
    logWithTime(`📝 Research topic: "${initialQuery}"`, colors.blue);

    // Get breath and depth parameters
    const breadth =
      parseInt(await askQuestion('Enter research breadth (recommended 2-5, default 3): '), 10) || 3;
    const depth =
      parseInt(await askQuestion('Enter research depth (recommended 1-3, default 2): '), 10) || 2;

    logWithTime(`📊 Research parameters: breadth=${breadth}, depth=${depth}`, colors.cyan);
    logWithTime('🎯 Creating research plan...', colors.magenta);

    // Generate follow-up questions
    logWithTime('❓ Generating clarifying questions...', colors.yellow);
    const followUpQuestions = await generateFeedback({
      query: initialQuery,
    });

    // Initialize answers array
    const answers: string[] = [];

    if (followUpQuestions.length === 0) {
      logWithTime('ℹ️ Proceeding with research without follow-up questions...', colors.blue);
    } else {
      logWithTime('❗ Please answer these follow-up questions:', colors.yellow);

      // Collect answers to follow-up questions
      for (const question of followUpQuestions) {
        const answer = await askQuestion(`\n${colors.cyan}${question}\n${colors.yellow}Your answer: ${colors.reset}`);
        answers.push(answer);
      }

      logWithTime('✅ Thank you for your answers.', colors.green);
    }

    // Combine all information for deep research
    const combinedQuery = `
Initial Query: ${initialQuery}
${followUpQuestions.length > 0 ? `
Follow-up Questions and Answers:
${followUpQuestions.map((q, i) => `Q: ${q}\nA: ${answers[i]}`).join('\n')}` : ''}
`;

    logWithTime('🚀 Starting research process...', colors.bright);
    logWithTime('⏳ This may take a few minutes depending on the settings...', colors.dim);

    const { learnings, visitedUrls } = await deepResearch({
      query: combinedQuery,
      breadth,
      depth,
    });

    if (learnings.length === 0) {
      logWithTime('❌ No research results found. Please try again with different parameters.', colors.red);
      return;
    }

    logWithTime('✨ Research complete!', colors.green);
    logWithTime(`📚 Found ${learnings.length} key insights from ${visitedUrls.length} sources.`, colors.green);
    logWithTime('📝 Writing final report...', colors.magenta);

    const report = await writeFinalReport({
      prompt: combinedQuery,
      learnings,
      visitedUrls,
    });

    // Save report to file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = `deep-search-output-${timestamp}.md`;
    await fs.writeFile(outputFile, report, 'utf-8');

    const duration = Date.now() - startTime;
    logWithTime(`✅ Report has been saved to ${outputFile}`, colors.green);
    logWithTime(`⌛ Total research time: ${formatDuration(duration)}`, colors.bright);
    logWithTime('🎉 Thank you for using Deep Research!', colors.magenta);
  } catch (error: any) {
    if (error?.status === 402) {
      logWithTime('❌ Error: Free API credits exhausted. Please visit https://openrouter.ai/credits to add more credits.', colors.red);
    } else {
      logWithTime(`❌ Error: ${error.message || 'An unknown error occurred'}`, colors.red);
    }
  }
}

async function runLangflowSearch() {
  const startTime = Date.now();
  
  try {
    logWithTime('🔄 Starting Langflow Deep Research...', colors.bright);
    
    // Get initial query
    const initialQuery = await askQuestion('What would you like to research? ');
    logWithTime(`📝 Research topic: "${initialQuery}"`, colors.blue);

    logWithTime('🚀 Starting Langflow process...', colors.bright);
    logWithTime('⏳ This may take a few minutes...', colors.dim);

    const response = await runLangflowQuery(initialQuery);

    if (!response) {
      logWithTime('❌ No research results found. Please try again.', colors.red);
      return;
    }

    logWithTime('✨ Research complete!', colors.green);
    
    // Save report to file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = `langflow-output-${timestamp}.md`;
    await fs.writeFile(outputFile, response, 'utf-8');

    const duration = Date.now() - startTime;
    logWithTime(`✅ Report has been saved to ${outputFile}`, colors.green);
    logWithTime(`⌛ Total research time: ${formatDuration(duration)}`, colors.bright);
    logWithTime('🎉 Thank you for using Langflow Deep Research!', colors.magenta);
  } catch (error: any) {
    if (error?.status === 402) {
      logWithTime('❌ Error: API credits exhausted.', colors.red);
    } else {
      logWithTime(`❌ Error: ${error.message || 'An unknown error occurred'}`, colors.red);
    }
  }
}

// run the agent
async function run() {
  try {
    logWithTime('👋 Welcome to Deep Research!', colors.bright);
    logWithTime('Please choose your research mode:', colors.cyan);
    console.log(`${colors.yellow}1) Regular Deep Search ${colors.dim}(Customizable breadth/depth, extensive coverage)${colors.reset}`);
    console.log(`${colors.yellow}2) Langflow Deep Search ${colors.dim}(More accurate results, focused queries)${colors.reset}\n`);
    
    const choice = await askQuestion('Enter your choice (1 or 2): ');
    
    switch(choice.trim()) {
      case '1':
        logWithTime('ℹ️ Regular Deep Search selected:', colors.blue);
        logWithTime('📌 This mode allows you to customize research breadth and depth for extensive coverage.', colors.dim);
        logWithTime('📌 Best for broad topic exploration and comprehensive research.', colors.dim);
        await runDeepSearch();
        break;
      case '2':
        logWithTime('ℹ️ Langflow Deep Search selected:', colors.blue);
        logWithTime('📌 This mode provides more accurate and focused results.', colors.dim);
        logWithTime('📌 Best for specific queries where precision is important.', colors.dim);
        logWithTime('📌 Note: This mode does not have customizable depth/breadth parameters.', colors.dim);
        await runLangflowSearch();
        break;
      default:
        logWithTime('❌ Invalid choice. Please run the program again and select 1 or 2.', colors.red);
    }
  } catch (error: any) {
    logWithTime(`❌ Error: ${error.message || 'An unknown error occurred'}`, colors.red);
  } finally {
    rl.close();
  }
}

run().catch(error => {
  logWithTime(`💥 Fatal error: ${error.message || 'An unknown error occurred'}`, colors.red);
  process.exit(1);
});
