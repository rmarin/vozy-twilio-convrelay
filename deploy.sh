#!/bin/bash

# Deployment script for Vozy Twilio ConversationRelay Demo
# This script automates the deployment process using AWS SAM and environment variables

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Vozy Twilio ConversationRelay Deployment Script ===${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
  echo -e "${YELLOW}No .env file found. Creating one from .env.example...${NC}"
  if [ -f .env.example ]; then
    cp .env.example .env
    echo -e "${GREEN}Created .env file from .env.example${NC}"
    echo -e "${YELLOW}Please edit the .env file with your API keys and configuration before deploying.${NC}"
    exit 1
  else
    echo -e "${RED}Error: .env.example file not found. Cannot create .env file.${NC}"
    exit 1
  fi
fi

# Load environment variables from .env file
echo -e "${BLUE}Loading environment variables from .env file...${NC}"
source .env

# Check for required environment variables
if [ -z "$OPENAI_API_KEY" ]; then
  echo -e "${RED}Error: OPENAI_API_KEY is not set in .env file${NC}"
  exit 1
fi

if [ -z "$VOZY_AUTH_TOKEN" ]; then
  echo -e "${RED}Error: VOZY_AUTH_TOKEN is not set in .env file${NC}"
  exit 1
fi

# Build the SAM application
echo -e "${BLUE}Building the SAM application...${NC}"
sam build

if [ $? -ne 0 ]; then
  echo -e "${RED}Error: SAM build failed${NC}"
  exit 1
fi

echo -e "${GREEN}Build successful!${NC}"

# Deploy the SAM application
echo -e "${BLUE}Deploying the SAM application...${NC}"
echo -e "${YELLOW}You will be prompted to provide parameter values. Press Enter to use the default values from your .env file.${NC}"

# Prepare parameter overrides
PARAMETER_OVERRIDES="OpenAIApiKey=$OPENAI_API_KEY VozyAuthToken=$VOZY_AUTH_TOKEN"

# Add optional parameters if they exist in .env
if [ ! -z "$DEBUG" ]; then
  PARAMETER_OVERRIDES="$PARAMETER_OVERRIDES Debug=$DEBUG"
fi

if [ ! -z "$VOZY_API_URL" ]; then
  PARAMETER_OVERRIDES="$PARAMETER_OVERRIDES VozyApiUrl=$VOZY_API_URL"
fi

if [ ! -z "$WELCOME_GREETING" ]; then
  PARAMETER_OVERRIDES="$PARAMETER_OVERRIDES WelcomeGreeting=$WELCOME_GREETING"
fi

if [ ! -z "$SYSTEM_PROMPT" ]; then
  PARAMETER_OVERRIDES="$PARAMETER_OVERRIDES SystemPrompt=$SYSTEM_PROMPT"
fi

if [ ! -z "$TTS_PROVIDER" ]; then
  PARAMETER_OVERRIDES="$PARAMETER_OVERRIDES TtsProvider=$TTS_PROVIDER"
fi

if [ ! -z "$VOICE" ]; then
  PARAMETER_OVERRIDES="$PARAMETER_OVERRIDES Voice=$VOICE"
fi

if [ ! -z "$NLP_LANGUAGE" ]; then
  PARAMETER_OVERRIDES="$PARAMETER_OVERRIDES NlpLanguage=$NLP_LANGUAGE"
fi

if [ ! -z "$AUDIO_URL" ]; then
  PARAMETER_OVERRIDES="$PARAMETER_OVERRIDES AudioUrl=$AUDIO_URL"
fi

# Deploy with parameter overrides
sam deploy --guided --parameter-overrides "$PARAMETER_OVERRIDES"

if [ $? -ne 0 ]; then
  echo -e "${RED}Error: SAM deployment failed${NC}"
  exit 1
fi

echo -e "${GREEN}Deployment successful!${NC}"

# Run the comprehensive test
echo -e "${BLUE}Running post-deployment tests...${NC}"
echo -e "${YELLOW}Note: You need to have the 'ws' package installed for WebSocket testing.${NC}"
echo -e "${YELLOW}If tests fail due to missing 'ws' package, run: npm install ws${NC}"

# Check if test-comprehensive.sh exists, otherwise use test-e2e.sh
if [ -f test-comprehensive.sh ]; then
  chmod +x test-comprehensive.sh
  ./test-comprehensive.sh
elif [ -f test-e2e.sh ]; then
  chmod +x test-e2e.sh
  ./test-e2e.sh
else
  echo -e "${YELLOW}Warning: No test script found. Skipping tests.${NC}"
fi

echo -e "${GREEN}Deployment and testing completed!${NC}"
echo -e "${BLUE}Your Twilio ConversationRelay Voice Assistant is now deployed and ready to use.${NC}"
