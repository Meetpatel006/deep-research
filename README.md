# Deep Research Project

A powerful research and AI interaction tool that leverages multiple AI providers and advanced features for deep research capabilities.

## 🔍 Search Modes

The project offers two distinct research modes:

### 1. Regular Deep Search
- Customizable research parameters:
  - **Breadth**: Control how many parallel research paths to explore (recommended: 2-5)
  - **Depth**: Define how deep to go in each research path (recommended: 1-3)
- More flexible and extensive search coverage
- Great for broad topic exploration

### 2. Langflow Deep Search
- Streamlined, single-query research process
- No customizable depth/breadth parameters
- Generally provides more accurate and focused results
- Ideal for specific, targeted research queries

Choose your mode based on your research needs:
- Use Regular Deep Search when you need extensive coverage and want to control the scope
- Use Langflow when you need precise, accurate results for focused queries

## 🚀 Features

- Multi-provider AI support (Google AI, Groq)
- Integration with Langflow for advanced workflows
- Firecrawl integration for web crawling and data gathering
- Feedback system for AI responses
- Deep research capabilities with structured output
- TypeScript-based implementation for type safety

## 📋 Prerequisites

- Node.js 22.x
- npm or pnpm package manager
- Required API keys for various services

## 🔑 Required API Keys

The project requires several API keys to function properly. Create a `.env.local` file with the following variables:

```env
OPENROUTER_API_KEY=your_openrouter_key
GOOGLE_API_KEY=your_google_api_key
LANGFLOW_API_KEY=your_langflow_key
LANGFLOW_FLOW_ID=your_flow_id
LANGFLOW_ID=your_langflow_id
LANGFLOW_BASE_URL=your_langflow_base_url
FIRECRAWL_KEY=your_firecrawl_key
OPENAI_KEY=your_openai_key
GROQ_API_KEY=your_groq_key
```

## 🛠️ Installation

1. Clone the repository
```bash
git clone https://github.com/Meetpatel006/deep-research.git
cd deep-research
```

2. Install dependencies
```bash
npm install
# or
pnpm install
```

3. Copy the environment file
```bash
cp .env.sample .env.local
```

4. Update the `.env.local` file with your API keys

## 📦 Project Structure

```
deep-research/
├── src/
│   ├── ai/                    # AI-related implementations
│   ├── utils/                 # Utility functions
│   ├── deep-research.ts       # Core research functionality
│   ├── langflow-client.ts     # Langflow integration
│   ├── run.ts                 # Main execution file
│   ├── feedback.ts            # Feedback system
│   └── prompt.ts              # Prompt templates
├── .env.sample               # Sample environment variables
├── .env.local               # Local environment configuration
├── package.json             # Project dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── prettier.config.mjs     # Code formatting configuration
└── README.md              # Project documentation
```

## 🚀 Usage

To start the application:

```bash
npm start
# or
pnpm start
```

For development with automatic reloading:
```bash
pnpm tsx --env-file=.env.local src/run.ts
```

## 📝 Scripts

- `format`: Format code using Prettier
- `tsx`: Run TypeScript files with environment variables
- `start`: Start the application
- `test`: Run tests (currently placeholder)

## 🔧 Dependencies

### Main Dependencies
- @ai-sdk/openai
- @google/generative-ai
- @mendable/firecrawl-js
- axios
- openai
- zod
- and more...

### Development Dependencies
- TypeScript
- Prettier
- tsx
- Various type definitions

## 🛡️ Environment Requirements

- Node.js version: 22.x
- TypeScript version: 5.7.3
- Operating System: Cross-platform

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 🙏 Acknowledgments

- OpenAI for AI capabilities
- Google AI for additional AI features
- Langflow for workflow management
- Firecrawl for web crawling capabilities #
