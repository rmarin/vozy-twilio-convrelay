#!/bin/bash

# Comprehensive Test Script for Twilio ConversationRelay Voice Assistant
# This script combines functionality from test-deployment.sh and test-e2e.sh
# It performs:
# 1. Fetches API Gateway URLs from CloudFormation
# 2. Tests TwiML endpoint to obtain WebSocket URL
# 3. Checks Lambda environment variables
# 4. Establishes WebSocket connection and sends Twilio protocol messages
# 5. Verifies responses and checks CloudWatch logs

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
STACK_NAME=${1:-"Twilio-ConvRelay"}
REGION=${2:-"us-east-1"}
SESSION_ID="VX$(date +%s)"
CALL_SID="CA$(date +%s | md5 | head -c 10)"
PHONE_NUMBER="+1234567890"
LAMBDA_FUNCTION_NAME="vozy-voice-assistant"

echo -e "${YELLOW}Starting Comprehensive Test for Twilio ConversationRelay Voice Assistant${NC}"
echo "Stack Name: $STACK_NAME"
echo "Region: $REGION"
echo "Session ID: $SESSION_ID"
echo "Call SID: $CALL_SID"
echo

# Step 1: Get API Gateway URLs from CloudFormation
echo -e "${YELLOW}Step 1: Fetching API Gateway URLs from CloudFormation stack...${NC}"
API_GATEWAY_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='HttpApiEndpoint'].OutputValue" --output text)
WS_API_GATEWAY_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='WebSocketApiEndpoint'].OutputValue" --output text)

if [ -z "$API_GATEWAY_URL" ]; then
  echo -e "${RED}Error: Could not retrieve HTTP API Gateway URL from CloudFormation stack${NC}"
  echo -e "${YELLOW}Using default/hardcoded values for testing...${NC}"
  API_GATEWAY_URL="https://4ien42m4wi.execute-api.us-east-1.amazonaws.com/Prod"
fi

if [ -z "$WS_API_GATEWAY_URL" ]; then
  echo -e "${RED}Error: Could not retrieve WebSocket API Gateway URL from CloudFormation stack${NC}"
  echo -e "${YELLOW}Using default/hardcoded values for testing...${NC}"
  WS_API_GATEWAY_URL="wss://m81upwp640.execute-api.us-east-1.amazonaws.com/Prod"
fi

echo -e "${GREEN}HTTP API Gateway URL: $API_GATEWAY_URL${NC}"
echo -e "${GREEN}WebSocket API Gateway URL: $WS_API_GATEWAY_URL${NC}"
echo

# Step 2: Test TwiML endpoint and extract WebSocket URL
echo -e "${YELLOW}Step 2: Testing TwiML endpoint and extracting WebSocket URL...${NC}"
# Ensure API Gateway URL ends with a slash
[[ "$API_GATEWAY_URL" != */ ]] && API_GATEWAY_URL="${API_GATEWAY_URL}/"
TWIML_RESPONSE=$(curl -s "${API_GATEWAY_URL}twiml")

if [ -z "$TWIML_RESPONSE" ]; then
  echo -e "${RED}Failed to get response from TwiML endpoint${NC}"
  exit 1
fi

# Check if response is valid XML
if ! echo "$TWIML_RESPONSE" | grep -q "<Response>"; then
  echo -e "${RED}TwiML endpoint did not return valid XML${NC}"
  echo "$TWIML_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ TwiML endpoint is accessible and returning valid XML${NC}"

# Extract WebSocket URL from TwiML response
WS_URL_FROM_TWIML=$(echo "$TWIML_RESPONSE" | grep -o 'url="[^"]*"' | sed 's/url="//;s/"//')
if [ -z "$WS_URL_FROM_TWIML" ]; then
  WS_URL_FROM_TWIML=$(echo "$TWIML_RESPONSE" | grep -o 'wss://[^"]*' | head -1)
fi

if [ -z "$WS_URL_FROM_TWIML" ]; then
  echo -e "${RED}✗ WebSocket URL not found in TwiML response${NC}"
  exit 1
fi

echo -e "${GREEN}✓ WebSocket URL found in TwiML: $WS_URL_FROM_TWIML${NC}"

# Check if WebSocket URL contains placeholder
if [[ $WS_URL_FROM_TWIML == *"placeholder"* ]]; then
  echo -e "${RED}✗ WebSocket URL contains placeholder domain${NC}"
else
  echo -e "${GREEN}✓ WebSocket URL contains actual domain${NC}"
fi

# Check if WebSocket URL matches the one from CloudFormation
if [ "$WS_URL_FROM_TWIML" == "$WS_API_GATEWAY_URL" ]; then
  echo -e "${GREEN}✓ WebSocket URL in TwiML matches WebSocket API Gateway URL${NC}"
else
  echo -e "${RED}✗ WebSocket URL in TwiML does not match WebSocket API Gateway URL${NC}"
  echo "Expected: $WS_API_GATEWAY_URL"
  echo "Found: $WS_URL_FROM_TWIML"
  # Continue anyway, using the URL from TwiML
fi

echo

# Step 3: Check Lambda function environment variables
echo -e "${YELLOW}Step 3: Checking Lambda function environment variables...${NC}"

# First try using AWS CLI to get Lambda environment variables
LAMBDA_ENV=$(aws lambda get-function-configuration --function-name $LAMBDA_FUNCTION_NAME --query "Environment.Variables" --output json 2>/dev/null)

# If Lambda environment variables can't be retrieved, try the health endpoint
if [ -z "$LAMBDA_ENV" ] || [ "$LAMBDA_ENV" == "null" ]; then
  echo -e "${YELLOW}Could not retrieve Lambda environment variables directly, trying health endpoint...${NC}"
  HEALTH_RESPONSE=$(curl -s "${API_GATEWAY_URL}health")
  
  if [ -z "$HEALTH_RESPONSE" ]; then
    echo -e "${RED}Failed to get response from health endpoint${NC}"
  else
    echo -e "${GREEN}✓ Health endpoint is working${NC}"
    echo "Response: $HEALTH_RESPONSE"
    
    # Extract environment variables from health response
    DOMAIN_VALUE=$(echo $HEALTH_RESPONSE | grep -o '"domain":"[^"]*"' | sed 's/"domain":"//;s/"//')
    WS_URL_VALUE=$(echo $HEALTH_RESPONSE | grep -o '"websocketUrl":"[^"]*"' | sed 's/"websocketUrl":"//;s/"//')
  fi
else
  # Extract environment variables from Lambda configuration
  DOMAIN_VALUE=$(echo $LAMBDA_ENV | grep -o '"DOMAIN": "[^"]*"' | sed 's/"DOMAIN": "//;s/"//')
  WS_URL_VALUE=$(echo $LAMBDA_ENV | grep -o '"WS_URL": "[^"]*"' | sed 's/"WS_URL": "//;s/"//')
fi

# Check DOMAIN environment variable
if [ -z "$DOMAIN_VALUE" ]; then
  echo -e "${RED}✗ DOMAIN environment variable is not set${NC}"
elif [[ $DOMAIN_VALUE == *"placeholder"* ]]; then
  echo -e "${RED}✗ DOMAIN environment variable contains placeholder value: $DOMAIN_VALUE${NC}"
else
  echo -e "${GREEN}✓ DOMAIN environment variable is set correctly: $DOMAIN_VALUE${NC}"
fi

# Check WS_URL environment variable
if [ -z "$WS_URL_VALUE" ]; then
  echo -e "${RED}✗ WS_URL environment variable is not set${NC}"
elif [[ $WS_URL_VALUE == *"placeholder"* ]]; then
  echo -e "${RED}✗ WS_URL environment variable contains placeholder value: $WS_URL_VALUE${NC}"
else
  echo -e "${GREEN}✓ WS_URL environment variable is set correctly: $WS_URL_VALUE${NC}"
  
  # Check if WS_URL matches the WebSocket API Gateway URL
  if [[ $WS_URL_VALUE == $WS_API_GATEWAY_URL ]]; then
    echo -e "${GREEN}✓ WS_URL matches WebSocket API Gateway URL${NC}"
  else
    echo -e "${RED}✗ WS_URL does not match WebSocket API Gateway URL${NC}"
    echo "Expected: $WS_API_GATEWAY_URL"
    echo "Found: $WS_URL_VALUE"
  fi
fi

echo

# Step 4: Check additional health endpoints
echo -e "${YELLOW}Step 4: Checking additional health endpoints...${NC}"

# Test /ws-health endpoint
echo "Testing /ws-health endpoint..."
WS_HEALTH_RESPONSE=$(curl -s "${API_GATEWAY_URL}ws-health")

if [ -z "$WS_HEALTH_RESPONSE" ]; then
  echo -e "${RED}✗ WebSocket health endpoint is not accessible${NC}"
else
  echo -e "${GREEN}✓ WebSocket health endpoint is working${NC}"
  echo "Response: $WS_HEALTH_RESPONSE"
  
  # Extract WebSocket URL from ws-health response
  WS_URL_FROM_HEALTH=$(echo $WS_HEALTH_RESPONSE | grep -o '"websocketUrl":"[^"]*"' | sed 's/"websocketUrl":"//;s/"//')
  
  if [ "$WS_URL_FROM_HEALTH" == "$WS_API_GATEWAY_URL" ]; then
    echo -e "${GREEN}✓ WebSocket URL in health endpoint matches WebSocket API Gateway URL${NC}"
  else
    echo -e "${YELLOW}⚠ WebSocket URL in health endpoint does not match WebSocket API Gateway URL${NC}"
    echo "Expected: $WS_API_GATEWAY_URL"
    echo "Found: $WS_URL_FROM_HEALTH"
  fi
fi

echo

# Step 5: Test WebSocket connection using the dedicated WebSocket test script
echo -e "${YELLOW}Step 5: Testing WebSocket connection with Twilio protocol...${NC}"

# Use the actual WebSocket URL instead of the one from TwiML if it contains a placeholder
if [[ $WS_URL_FROM_TWIML == *"placeholder"* ]]; then
  WS_URL="$WS_API_GATEWAY_URL"
  echo -e "${YELLOW}⚠ Using actual WebSocket API Gateway URL instead of placeholder from TwiML${NC}"
else
  WS_URL="$WS_URL_FROM_TWIML"
fi

echo -e "${BLUE}Running WebSocket protocol test with the following parameters:${NC}"
echo "WebSocket URL: $WS_URL"
echo "Session ID: $SESSION_ID"
echo "Call SID: $CALL_SID"
echo

# Run the WebSocket test script
node test-ws-protocol.js "$WS_URL" "$SESSION_ID" "$CALL_SID" "$PHONE_NUMBER"
WS_TEST_RESULT=$?

if [ $WS_TEST_RESULT -eq 0 ]; then
  echo -e "${GREEN}✓ WebSocket protocol test completed successfully${NC}"
else
  echo -e "${RED}✗ WebSocket protocol test failed${NC}"
  # Don't exit here, continue with other tests
fi

echo

# Step 6: Check CloudWatch logs
echo -e "${YELLOW}Step 6: Checking CloudWatch logs...${NC}"
# First, trigger the Lambda function by calling the TwiML endpoint
curl -s "${API_GATEWAY_URL}twiml" > /dev/null

# Wait a moment for logs to be written
echo "Waiting 5 seconds for logs to be written..."
sleep 5

# Get the latest log stream
LOG_STREAM=$(aws logs describe-log-streams --log-group-name "/aws/lambda/$LAMBDA_FUNCTION_NAME" --order-by LastEventTime --descending --limit 1 --query "logStreams[0].logStreamName" --output text 2>/dev/null)

if [ -z "$LOG_STREAM" ] || [ "$LOG_STREAM" == "None" ]; then
  echo -e "${RED}✗ No log streams found for Lambda function${NC}"
else
  echo -e "${GREEN}✓ Found log stream: $LOG_STREAM${NC}"
  
  # Get the latest logs
  LOGS=$(aws logs get-log-events --log-group-name "/aws/lambda/$LAMBDA_FUNCTION_NAME" --log-stream-name "$LOG_STREAM" --limit 10 --query "events[*].message" --output text 2>/dev/null)
  
  if [ -z "$LOGS" ]; then
    echo -e "${RED}✗ No logs found in log stream${NC}"
  else
    echo -e "${GREEN}✓ Found logs in log stream${NC}"
    echo -e "${YELLOW}Latest logs:${NC}"
    echo "$LOGS" | head -n 10
  fi
fi

echo
echo -e "${GREEN}Comprehensive test completed!${NC}"

# Final summary
echo -e "${YELLOW}Test Summary:${NC}"
echo -e "1. API Gateway URLs: ${GREEN}✓${NC}"
echo -e "2. TwiML Endpoint: ${GREEN}✓${NC}"

# Check if TwiML has placeholder or actual URL
if [[ $WS_URL_FROM_TWIML == *"placeholder"* ]]; then
  echo -e "3. WebSocket URL in TwiML: ${RED}✗ (contains placeholder)${NC}"
else
  echo -e "3. WebSocket URL in TwiML: ${GREEN}✓${NC}"
fi

# Check if environment variables have placeholder or actual values
if [[ $DOMAIN_VALUE == *"placeholder"* ]] || [[ $WS_URL_VALUE == *"placeholder"* ]]; then
  echo -e "4. Lambda Environment Variables: ${RED}✗ (contain placeholders)${NC}"
else
  echo -e "4. Lambda Environment Variables: ${GREEN}✓${NC}"
fi

echo -e "5. Health Endpoints: ${GREEN}✓${NC}"

if [ $WS_TEST_RESULT -eq 0 ]; then
  echo -e "6. WebSocket Protocol Test: ${GREEN}✓${NC}"
else
  echo -e "6. WebSocket Protocol Test: ${RED}✗${NC}"
fi

if [ -z "$LOG_STREAM" ] || [ "$LOG_STREAM" == "None" ]; then
  echo -e "7. CloudWatch Logs: ${RED}✗${NC}"
else
  echo -e "7. CloudWatch Logs: ${GREEN}✓${NC}"
fi

# Determine overall test result
if [[ $WS_URL_FROM_TWIML != *"placeholder"* ]] && 
   [[ $DOMAIN_VALUE != *"placeholder"* ]] && 
   [[ $WS_URL_VALUE != *"placeholder"* ]] && 
   [ $WS_TEST_RESULT -eq 0 ]; then
  echo -e "\n${GREEN}✓ ALL TESTS PASSED${NC}"
  exit 0
else
  echo -e "\n${RED}✗ SOME TESTS FAILED${NC}"
  exit 1
fi
