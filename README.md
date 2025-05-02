# Vozy Twilio ConversationRelay Demo

This project demonstrates a voice assistant built with AWS Lambda and API Gateway that integrates with Twilio's ConversationRelay feature. It enables real-time voice conversations with an AI assistant through WebSockets.

## Architecture

- **AWS Lambda**: Handles all WebSocket connections and message processing
- **API Gateway**: Provides HTTP and WebSocket endpoints
- **Twilio ConversationRelay**: Bridges phone calls to our WebSocket API
- **Vozy API**: Provides AI responses (with OpenAI fallback)

## Features

- Real-time voice conversations via WebSockets
- Automatic session management using callSid
- Support for interruptions, DTMF input, and media playback
- Comprehensive testing tools
- Custom deployment resources to automatically configure environment variables

## Prerequisites

- Node.js 18.x or later
- AWS CLI and AWS SAM CLI
- AWS account with appropriate permissions
- Twilio account with ConversationRelay capability
- Vozy API credentials (or OpenAI API key for fallback)

## Repository Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/vozy-twilio-conrelay-demo.git
   cd vozy-twilio-conrelay-demo
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file with your API keys and configuration.

## Deployment

### Automated Deployment

Use the provided deployment script which handles all the necessary steps:

```bash
chmod +x deploy.sh
./deploy.sh
```

This script will:
1. Check for a valid `.env` file
2. Load environment variables
3. Build the SAM application
4. Deploy with your configuration values
5. Run post-deployment tests

### Manual Deployment

Alternatively, you can deploy manually using the AWS SAM CLI:

```bash
sam build
sam deploy --guided --parameter-overrides "OpenAIApiKey=your-key VozyAuthToken=your-token"
```

After deployment, the custom resource will automatically update the Lambda environment variables with the correct API Gateway URLs.

## Testing

### Comprehensive Testing

Run a complete test suite that checks all aspects of the deployment:

```bash
chmod +x test-comprehensive.sh
./test-comprehensive.sh
```

This script performs:
- API Gateway URL verification
- TwiML endpoint testing
- Lambda environment variable validation
- WebSocket protocol testing
- CloudWatch logs verification

### WebSocket Protocol Testing

Test just the WebSocket protocol functionality:

```bash
node test-ws-protocol.js "wss://your-api-gateway-url/Prod" "session-id" "call-sid" "+1234567890"
```

## Environment Variables

### Required Variables

- `OPENAI_API_KEY`: Your OpenAI API key (for fallback)
- `VOZY_AUTH_TOKEN`: Vozy API authentication token

### Optional Variables

- `VOZY_API_URL`: Vozy API endpoint
- `DEBUG`: Enable verbose logging (true/false)
- `WELCOME_GREETING`: Initial greeting for the voice assistant
- `SYSTEM_PROMPT`: System prompt for the AI assistant
- `TTS_PROVIDER`: Text-to-speech provider (e.g., "ElevenLabs")
- `VOICE`: Voice ID for text-to-speech
- `NLP_LANGUAGE`: Language for NLP processing (e.g., "es-ES")
- `AUDIO_URL`: URL for audio playback

### Automatically Set Variables

These variables are automatically set by the CloudFormation custom resource during deployment:

- `DOMAIN`: API Gateway domain
- `WS_URL`: WebSocket URL

## Project Structure

- `lambda.js`: Main Lambda handler function
- `template.yaml`: SAM template for AWS resources
- `custom-resource/`: Contains the custom resource for updating environment variables
- `test-ws-protocol.js`: WebSocket protocol test script
- `test-comprehensive.sh`: Comprehensive test script
- `deploy.sh`: Deployment automation script

## Troubleshooting

### WebSocket Testing Fails

If WebSocket testing fails with an error about the `ws` package:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'ws'
```

Install the WebSocket package:

```bash
npm install ws
```

### Environment Variables Not Updated

If the Lambda environment variables are not updated correctly after deployment:

1. Check the CloudFormation stack events for any errors
2. Verify the custom resource executed successfully
3. Manually update the Lambda environment variables with the correct API Gateway URLs

## License

MIT
