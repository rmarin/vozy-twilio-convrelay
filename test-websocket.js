#!/usr/bin/env node
/**
 * WebSocket Testing Script for Twilio-ConvRelay
 * 
 * This script tests the WebSocket connection to the Lambda function
 * and simulates the API we're developing.
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';
import readline from 'readline';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configuration
let API_URL;
let WS_URL;

// Parse command line arguments
if (process.argv[2]) {
  // If the argument is a WebSocket URL, extract the HTTP URL
  if (process.argv[2].startsWith('wss://')) {
    WS_URL = process.argv[2];
    // Convert wss:// to https:// and remove any trailing path
    API_URL = WS_URL.replace('wss://', 'https://').split('/').slice(0, 3).join('/');
  } else {
    API_URL = process.argv[2];
    if (API_URL.endsWith('/')) {
      API_URL = API_URL.slice(0, -1);
    }
  }
} else {
  // Default URLs
  API_URL = 'https://4ien42m4wi.execute-api.us-east-1.amazonaws.com/Prod';
}

// Remove trailing slash if present
if (API_URL.endsWith('/')) {
  API_URL = API_URL.slice(0, -1);
}

// Generate a random call SID for testing
const CALL_SID = 'CA' + Math.random().toString(36).substring(2, 15);
const PHONE_NUMBER = '+1234567890';

async function testHealthEndpoints() {
  console.log(`${colors.yellow}Testing health endpoints...${colors.reset}`);
  
  try {
    // Test /health endpoint
    console.log(`${colors.blue}Testing /health endpoint...${colors.reset}`);
    const healthResponse = await fetch(`${API_URL}/health`);
    const healthData = await healthResponse.json();
    console.log(`${colors.green}Health endpoint response:${colors.reset}`, healthData);
    
    // Test /ws-health endpoint
    console.log(`${colors.blue}Testing /ws-health endpoint...${colors.reset}`);
    const wsHealthResponse = await fetch(`${API_URL}/ws-health`);
    const wsHealthData = await wsHealthResponse.json();
    console.log(`${colors.green}WebSocket health endpoint response:${colors.reset}`, wsHealthData);
    
    // Get WebSocket URL from health endpoint
    return wsHealthData.websocketUrl;
  } catch (error) {
    console.error(`${colors.red}Error testing health endpoints:${colors.reset}`, error);
    // If WS_URL was provided as a command line argument, use that
    if (WS_URL) {
      return WS_URL;
    }
    // Otherwise, try to construct it from the API URL
    return `wss://${API_URL.replace('https://', '')}/ws`;
  }
}

async function testBasicWebSocketConnectivity(wsUrl) {
  return new Promise((resolve, reject) => {
    // Make sure the WebSocket URL doesn't have a duplicate protocol
    if (wsUrl.startsWith('wss://wss://')) {
      wsUrl = wsUrl.replace('wss://wss://', 'wss://');
    }
    
    console.log(`${colors.yellow}Testing basic WebSocket connectivity to ${wsUrl}...${colors.reset}`);
    
    const ws = new WebSocket(wsUrl);
    let connectivityTestPassed = false;
    
    // Set a timeout to close the connection if it doesn't connect within 5 seconds
    const timeout = setTimeout(() => {
      if (!connectivityTestPassed) {
        console.error(`${colors.red}WebSocket connection timed out${colors.reset}`);
        ws.close();
        reject(new Error('WebSocket connection timed out'));
      }
    }, 5000);
    
    // Set a timeout for ping response
    let pingResponseReceived = false;
    let pingTimeout;
    
    ws.on('open', () => {
      console.log(`${colors.green}Basic WebSocket connectivity test PASSED!${colors.reset}`);
      connectivityTestPassed = true;
      clearTimeout(timeout);
      
      // Send a simple ping message
      const pingMessage = { type: 'ping', timestamp: new Date().toISOString() };
      console.log(`${colors.blue}Sending ping message:${colors.reset}`, pingMessage);
      ws.send(JSON.stringify(pingMessage));
      
      // Set timeout for ping response
      pingTimeout = setTimeout(() => {
        if (!pingResponseReceived) {
          console.error(`${colors.red}Ping response timed out after 3 seconds${colors.reset}`);
          ws.close();
          resolve(true); // Still resolve as connected, but with timeout warning
        }
      }, 3000);
      
      // Close after a short delay if ping response is received
      setTimeout(() => {
        if (pingResponseReceived) {
          ws.close();
          resolve(true);
        }
      }, 3500);
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        console.log(`${colors.green}Received response to ping:${colors.reset}`, message);
        
        // Check if this is a pong response
        if (message.type === 'pong' || (message.body && JSON.parse(message.body).type === 'pong')) {
          pingResponseReceived = true;
          clearTimeout(pingTimeout);
          console.log(`${colors.green}✓ Ping-Pong test successful${colors.reset}`);
          
          // Extract the actual pong message if it's wrapped in a body
          if (message.body) {
            const pongMessage = JSON.parse(message.body);
            console.log(`${colors.cyan}Pong details:${colors.reset}`, pongMessage);
          }
        }
      } catch (error) {
        console.error(`${colors.red}Error parsing message:${colors.reset}`, error);
      }
    });
    
    ws.on('error', (error) => {
      console.error(`${colors.red}WebSocket connectivity error:${colors.reset}`, error);
      clearTimeout(timeout);
      reject(error);
    });
    
    ws.on('close', () => {
      if (!connectivityTestPassed) {
        console.error(`${colors.red}WebSocket connection closed before establishing connection${colors.reset}`);
        clearTimeout(timeout);
        reject(new Error('WebSocket connection closed unexpectedly'));
      }
    });
  });
}

async function testWebSocketConnection(wsUrl) {
  return new Promise((resolve, reject) => {
    // Make sure the WebSocket URL doesn't have a duplicate protocol
    if (wsUrl.startsWith('wss://wss://')) {
      wsUrl = wsUrl.replace('wss://wss://', 'wss://');
    }
    
    console.log(`${colors.yellow}Testing Twilio ConversationRelay WebSocket protocol to ${wsUrl}...${colors.reset}`);
    
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => {
      console.log(`${colors.green}WebSocket connection established!${colors.reset}`);
      
      // Send setup message that complies with Twilio's format
      const setupMessage = {
        type: 'setup',
        sessionId: 'VX' + Math.random().toString(36).substring(2, 15),
        callSid: CALL_SID,
        from: PHONE_NUMBER,
        to: '+18881234567',
        direction: 'inbound',
        customParameters: {
          test: 'true'
        }
      };
      
      console.log(`${colors.blue}Sending setup message:${colors.reset}`, setupMessage);
      ws.send(JSON.stringify(setupMessage));
      
      // No need to wait for setup response as the server doesn't send one
      console.log(`${colors.green}✓ Setup message sent (no response expected)${colors.reset}`);
      
      // Wait a short time to ensure setup is processed before continuing
      setTimeout(() => {
        console.log(`${colors.blue}Ready for prompts...${colors.reset}`);
      }, 1000);
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        console.log(`${colors.green}Received message:${colors.reset}`, message);
        
        // Check if this is a response wrapped in a body property (API Gateway format)
        if (message.body) {
          try {
            const bodyContent = JSON.parse(message.body);
            console.log(`${colors.cyan}Message body content:${colors.reset}`, bodyContent);
            
            // We no longer check for setup response since the server doesn't send one
            
            // Handle text responses
            if (bodyContent.type === 'text') {
              console.log(`${colors.magenta}Assistant response:${colors.reset} ${bodyContent.token}`);
              console.log(`${colors.magenta}Is last token:${colors.reset} ${bodyContent.last}`);
            }
          } catch (e) {
            console.log(`${colors.yellow}Message body is not valid JSON:${colors.reset}`, message.body);
          }
        } else {
          // Direct message format
          if (message.type === 'connected') {
            setupResponseReceived = true;
            clearTimeout(setupTimeout);
            console.log(`${colors.green}✓ Setup successful - Connection established with callSid: ${message.callSid}${colors.reset}`);
          }
          
          if (message.type === 'text') {
            console.log(`${colors.magenta}Assistant response:${colors.reset} ${message.token}`);
            console.log(`${colors.magenta}Is last token:${colors.reset} ${message.last}`);
          }
        }
      } catch (error) {
        console.error(`${colors.red}Error parsing message:${colors.reset}`, error);
      }
    });
    
    ws.on('error', (error) => {
      console.error(`${colors.red}WebSocket error:${colors.reset}`, error);
      reject(error);
    });
    
    ws.on('close', () => {
      console.log(`${colors.yellow}WebSocket connection closed${colors.reset}`);
      resolve();
    });
    
    // Allow user to send prompts or special commands
    function promptUser() {
      rl.question(`${colors.cyan}Enter a prompt, 'dtmf X', 'play URL', or 'exit' to quit:${colors.reset} `, (input) => {
        if (input.toLowerCase() === 'exit') {
          console.log(`${colors.yellow}Closing WebSocket connection...${colors.reset}`);
          ws.close();
          rl.close();
          return;
        }
        
        // Handle DTMF command
        if (input.toLowerCase().startsWith('dtmf ')) {
          const digit = input.split(' ')[1];
          if (digit && /^[0-9*#]$/.test(digit)) {
            const dtmfMessage = {
              type: 'dtmf',
              digit: digit
            };
            console.log(`${colors.blue}Simulating DTMF message:${colors.reset}`, dtmfMessage);
            ws.send(JSON.stringify(dtmfMessage));
          } else {
            console.log(`${colors.red}Invalid DTMF digit. Use 0-9, *, or #${colors.reset}`);
          }
        }
        // Handle play media command
        else if (input.toLowerCase().startsWith('play ')) {
          const url = input.substring(5).trim();
          if (url) {
            const playMessage = {
              type: 'play',
              source: url,
              loop: 1,
              preemptible: false
            };
            console.log(`${colors.blue}Sending play media message:${colors.reset}`, playMessage);
            ws.send(JSON.stringify(playMessage));
          } else {
            console.log(`${colors.red}Invalid URL for play command${colors.reset}`);
          }
        }
        // Regular prompt
        else {
          const promptMessage = {
            type: 'prompt',
            voicePrompt: input,
            lang: 'en-US',
            last: true
          };
          
          console.log(`${colors.blue}Sending prompt message:${colors.reset}`, promptMessage);
          ws.send(JSON.stringify(promptMessage));
        }
        
        // Prompt again after a short delay
        setTimeout(promptUser, 1000);
      });
    }
    
    // Start prompting after a short delay to allow setup to complete
    setTimeout(promptUser, 2000);
  });
}

async function main() {
  try {
    console.log(`${colors.cyan}WebSocket Testing Script for Twilio-ConvRelay${colors.reset}`);
    console.log(`${colors.cyan}API URL: ${API_URL}${colors.reset}`);
    
    // Test health endpoints
    const wsUrl = await testHealthEndpoints();
    
    // First run a basic connectivity test
    console.log(`${colors.yellow}Running basic WebSocket connectivity test...${colors.reset}`);
    try {
      await testBasicWebSocketConnectivity(wsUrl);
      console.log(`${colors.green}✓ Basic WebSocket connectivity test passed${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}✗ Basic WebSocket connectivity test failed:${colors.reset}`, error.message);
      console.log(`${colors.yellow}Continuing with full protocol test anyway...${colors.reset}`);
    }
    
    // Test WebSocket connection with Twilio protocol
    await testWebSocketConnection(wsUrl);
  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset}`, error);
    process.exit(1);
  }
}

main();
