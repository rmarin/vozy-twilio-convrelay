import Fastify from "fastify";
import fastifyWs from "@fastify/websocket";
import OpenAI from "openai";
import dotenv from "dotenv";
import fetch from "node-fetch";
import awsLambda from "@fastify/aws-lambda";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand
} from "@aws-sdk/client-apigatewaymanagementapi";
dotenv.config();

// Debug flag - set to true for verbose logging, false for production mode
const DEBUG = process.env.DEBUG === 'true' || false;

const PORT = process.env.PORT || 8080;

// Get domain from environment variables - DOMAIN is set by the custom resource in AWS
// For local development, fall back to NGROK_URL
const DOMAIN = process.env.DOMAIN || process.env.NGROK_URL || `localhost:${PORT}`;

// Logger utility for standardized logging
const logger = {
  info: (message, callSid = '') => {
    const timestamp = new Date().toISOString();
    console.log(`INFO | ${callSid} | ${timestamp} | ${message}`);
  },
  debug: (message, callSid = '') => {
    if (DEBUG) {
      const timestamp = new Date().toISOString();
      console.log(`DEBUG | ${callSid} | ${timestamp} | ${message}`);
    }
  },
  error: (message, error = null, callSid = '') => {
    const timestamp = new Date().toISOString();
    console.error(`ERROR | ${callSid} | ${timestamp} | ${message}`, error || '');
  }
};

// Get WebSocket URL from environment variables - WS_URL is set by the custom resource in AWS
// For local development, derive it from DOMAIN
const WS_URL = process.env.WS_URL || (DOMAIN.startsWith('localhost') 
  ? `ws://${DOMAIN}/ws`
  : `wss://${DOMAIN}/ws`);
// Load all configuration from environment variables
const VOZY_API_URL = process.env.VOZY_API_URL || "";
const VOZY_AUTH_TOKEN = process.env.VOZY_AUTH_TOKEN || "";
const WELCOME_GREETING = process.env.WELCOME_GREETING || "Hola!";
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant. This conversation is being translated to voice, so answer carefully. When you respond, please spell out all numbers, for example twenty not 20. Do not include emojis in your responses. Do not include bullet points, asterisks, or special symbols.";
const sessions = new Map();
const TTS_PROVIDER = process.env.TTS_PROVIDER || "ElevenLabs";
const VOICE = process.env.VOICE || "J4vZAFDEcpenkMp3f3R9";
const NLP_LANGUAGE = process.env.NLP_LANGUAGE || "es-ES";
const AUDIO_URL = process.env.AUDIO_URL || "";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
async function aiResponse(messages) {
  let completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: messages,
  });
  return completion.choices[0].message.content;
}

const fastify = Fastify();
fastify.register(fastifyWs);

// Health check endpoint
fastify.get("/health", async (request, reply) => {
  logger.info('Health check endpoint called');
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    domain: DOMAIN,
    websocketUrl: WS_URL,
    version: '1.0.0'
  };
});

// WebSocket health check endpoint
fastify.get("/ws-health", async (request, reply) => {
  logger.info('WebSocket health check endpoint called');
  return {
    status: 'ok',
    websocketUrl: WS_URL,
    wsEndpoint: '/ws',
    supportedMessageTypes: ['setup', 'prompt', 'media'],
    timestamp: new Date().toISOString()
  };
});

fastify.all("/twiml", async (request, reply) => {
  reply.type("text/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Connect>
        <ConversationRelay url="${WS_URL}" welcomeGreeting="${WELCOME_GREETING}" ttsProvider="${TTS_PROVIDER}" voice="${VOICE}" language="${NLP_LANGUAGE}" dtmfDetection="true"/>
      </Connect>
    </Response>`
  );
});

// Register WebSocket handler for /ws endpoint
fastify.register(async function (fastify) {
  fastify.get("/ws", { websocket: true }, (ws, req) => {
    // This endpoint is needed for Fastify to register the WebSocket route
    // But the actual message handling is done in the Lambda handler function
    // via the API Gateway WebSocket integration
    
    logger.debug("WebSocket connection established via Fastify");
    
    // We'll keep a minimal message handler here for direct WebSocket connections
    // that bypass API Gateway (e.g., for local testing)
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data);
        logger.debug(`Received WebSocket message via Fastify: ${JSON.stringify(message)}`);
        
        // For testing, we'll just acknowledge receipt
        ws.send(JSON.stringify({
          type: "received",
          timestamp: new Date().toISOString(),
          message: "This WebSocket endpoint is configured for API Gateway integration. Direct connections are not fully supported."
        }));
      } catch (error) {
        logger.error("Error processing direct WebSocket message", error);
      }
    });
  });
});

// Create the Lambda handler with @fastify/aws-lambda
const proxy = awsLambda(fastify, {
  // Set to true to strip the base path from the request URL
  // This handles the /Prod path that AWS API Gateway adds in production
  stripBasePath: true
});

// Helper function to create a consistent API Gateway WebSocket response
function createResponse(data, statusCode = 200) {
  // For WebSocket API Gateway, we need to return a specific format
  // The response format should be { statusCode, body }
  // where body is a string (not an object)
  const response = {
    statusCode: 200,
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
  return response;
}

// Helper function to send WebSocket responses via API Gateway Management API
async function sendWebSocketResponse(event, data) {
  try {
    // Create the payload
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    
    // Create the management API client
    const client = new ApiGatewayManagementApiClient({
      endpoint: `https://${event.requestContext.domainName}/${event.requestContext.stage}`
    });
    
    // Send the message back to the client
    await client.send(new PostToConnectionCommand({
      ConnectionId: event.requestContext.connectionId,
      Data: payload
    }));
    
    // Return success status
    return { statusCode: 200, body: "" };
  } catch (error) {
    logger.error('Error sending WebSocket response', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send WebSocket response' }) };
  }
}

// Lambda handler function
export const handler = async (event, context) => {
  // Always log basic info for CloudWatch
  logger.info(`Lambda handler invoked with DOMAIN=${process.env.DOMAIN}`);
  
  // Log detailed event info only if DEBUG is true
  logger.debug(`Lambda event: ${JSON.stringify(event)}`);
  
  // Handle WebSocket events
  if (event.requestContext && event.requestContext.routeKey) {
    switch (event.requestContext.routeKey) {
      case '$connect':
        // Handle WebSocket connection
        logger.info('WebSocket connected', event.requestContext.connectionId);
        // Don't return anything on connect
        return { statusCode: 200, body: '' };
      
      case '$disconnect':
        // Handle WebSocket disconnection
        const disconnectConnectionId = event.requestContext.connectionId;
        logger.info('WebSocket disconnected');
        // Get callSid for this connection
        const callSidToDelete = sessions.get(`conn_${disconnectConnectionId}`);
        if (callSidToDelete) {
          // Delete the session (same as server.js)
          sessions.delete(callSidToDelete);
          // Also delete the connection mapping
          sessions.delete(`conn_${disconnectConnectionId}`);
          logger.debug(`Cleaned up session for callSid: ${callSidToDelete}`);
        }
        return { statusCode: 200, body: 'Disconnected' };

      
      case '$default':
        // Handle WebSocket messages
        try {
          const body = JSON.parse(event.body);
          logger.debug(`Processing WebSocket message: ${JSON.stringify(body)}`);
          // Process the message using the same logic as server.js
          switch (body.type) {
            case "ping":
              // Simple echo response for basic connectivity testing
              logger.debug(`Received ping message: ${JSON.stringify(body)}`);
              // Create ping response
              const pingResponse = {
                type: "pong",
                timestamp: new Date().toISOString(),
                echo: body.timestamp
              };
              logger.debug(`Sending ping response: ${JSON.stringify(pingResponse)}`);
              
              // Use the helper function to send the WebSocket response
              return await sendWebSocketResponse(event, pingResponse);
              
            case "setup":
              const callSid = body.callSid;
              const phoneNumber = body.from || "Unknown";
              logger.info(`Call connected`, callSid);
              logger.debug(`Setup for call from phone number: ${phoneNumber}`, callSid);
              // Store conversation by callSid (same as server.js)
              sessions.set(callSid, [{ role: "system", content: SYSTEM_PROMPT }]);
              // Store callSid by connectionId (equivalent to ws.callSid in server.js)
              sessions.set(`conn_${event.requestContext.connectionId}`, callSid);
              // Store the setup information but don't send a response
              logger.debug(`Setup completed for callSid: ${callSid}`, callSid);
              console.log('SETUP COMPLETED:', callSid);
              
              // Return success status without sending a WebSocket message
              return { statusCode: 200, body: "" };
              
            case "prompt":
              // Get callSid from connection mapping (equivalent to ws.callSid in server.js)
              const callSidForPrompt = sessions.get(`conn_${event.requestContext.connectionId}`);
              const userPrompt = body.voicePrompt || body.prompt || "";
              logger.debug(`Processing prompt: ${userPrompt}`, callSidForPrompt);
              let conversation = callSidForPrompt ? sessions.get(callSidForPrompt) : undefined;
              if (!conversation) {
                logger.error(`No conversation found for callSid: ${callSidForPrompt}, cannot process prompt.`);
                const errorMessage = {
                  type: "error",
                  message: "No session found for this connection. Please re-establish the call."
                };
                if (DEBUG) console.log('RETURN:', errorMessage);
                return await sendWebSocketResponse(event, errorMessage);
              }
              
              // Add user message to conversation
              conversation.push({ role: "user", content: userPrompt });
              
              try {
                // Start timing for API response (same as server.js)
                const startTime = Date.now();
                
                // Make POST request to Vozy API (same as server.js)
                const vozyResponse = await fetch(VOZY_API_URL, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${VOZY_AUTH_TOKEN}`
                  },
                  body: JSON.stringify({
                    from: callSidForPrompt,
                    body: userPrompt
                  })
                });
                
                const vozyData = await vozyResponse.json();
                
                // Calculate response time (same as server.js)
                const responseTime = Date.now() - startTime;
                // Log only the status and first 100 characters of the message
                const truncatedMessage = vozyData.message ? vozyData.message.substring(0, 100) + (vozyData.message.length > 100 ? '...' : '') : '';
                logger.debug(`Vozy API response - Status: ${vozyData.status} - Message: ${truncatedMessage}`, callSidForPrompt);
                logger.debug(`Vozy API response time: ${responseTime}ms`, callSidForPrompt);
                
                // Extract message from Vozy response
                const responseText = vozyData.message || "Lo siento, no pude procesar tu solicitud.";
                
                // Save the response in the conversation
                conversation.push({ role: "assistant", content: responseText });
                
                // Prepare the response message
                const promptResponse = {
                  type: "text",
                  token: responseText,
                  last: true
                };
                logger.debug(`Sending prompt response: ${JSON.stringify(promptResponse)}`, callSidForPrompt);
                console.log('PROMPT RETURN:', JSON.stringify(promptResponse));
                
                // Use the helper function to send the WebSocket response
                return await sendWebSocketResponse(event, promptResponse);
              } catch (error) {
                logger.error('Error calling Vozy API', error, callSidForPrompt);
                
                // Fallback to OpenAI if Vozy API fails (same as server.js)
                const fallbackResponseText = await aiResponse(conversation);
                conversation.push({ role: "assistant", content: fallbackResponseText });
                
                // Prepare the fallback response
                const fallbackResponseObj = {
                  type: "text",
                  token: fallbackResponseText,
                  last: true
                };
                logger.debug(`Sending fallback response: ${JSON.stringify(fallbackResponseObj)}`, callSidForPrompt);
                
                // Use the helper function to send the WebSocket response
                return await sendWebSocketResponse(event, fallbackResponseObj);
              }
              
            case "interrupt":
              const interruptCallSid = sessions.get(`conn_${event.requestContext.connectionId}`);
              logger.debug(`Handling interruption`, interruptCallSid);
              // Prepare the interrupt response
              const interruptResponse = {
                type: "interrupted",
                timestamp: new Date().toISOString()
              };
              logger.debug(`Sending interrupt response: ${JSON.stringify(interruptResponse)}`, interruptCallSid);
              
              // Use the helper function to send the WebSocket response
              return { statusCode: 200, body: "" };
              
            case "dtmf":
              const dtmfCallSid = sessions.get(`conn_${event.requestContext.connectionId}`);
              logger.debug(`DTMF received: ${body.digit}`, dtmfCallSid);
              
              // Check if the digit is 9
              if (body.digit === "9") {
                logger.debug(`Playing audio file for DTMF 9`, dtmfCallSid);
                
                // Prepare the play response
                const playResponse = {
                  type: "play",
                  source: AUDIO_URL,
                  loop: 1,
                  preemptible: false
                };
                logger.debug(`Sending play response: ${JSON.stringify(playResponse)}`, dtmfCallSid);
                
                // Use the helper function to send the WebSocket response
                return await sendWebSocketResponse(event, playResponse);
              }
              return await sendWebSocketResponse(event, { received: true });
              
            case "mark":
              const markCallSid = sessions.get(`conn_${event.requestContext.connectionId}`);
              logger.debug(`Mark event received: ${body.mark}`, markCallSid);
              return await sendWebSocketResponse(event, { received: true });
              
            case "media":
              const mediaCallSid = sessions.get(`conn_${event.requestContext.connectionId}`);
              logger.debug(`Media event received`, mediaCallSid);
              return await sendWebSocketResponse(event, { received: true });
              
            default:
              const defaultCallSid = sessions.get(`conn_${event.requestContext.connectionId}`);
              logger.debug(`Unhandled message type: ${body.type}`, defaultCallSid);
              return await sendWebSocketResponse(event, { received: true });

          }
        } catch (error) {
          logger.error('Error processing WebSocket message', error);
          return await sendWebSocketResponse(event, { error: 'Invalid message format' });
        }
    }
  }
  
  // Handle HTTP events (like /twiml endpoint)
  return await proxy(event, context);
};

// For local development
if (process.env.NODE_ENV !== 'production') {
  try {
    fastify.listen({ port: PORT });
    logger.info(`Server running at http://localhost:${PORT} and wss://${DOMAIN}/ws in ${DEBUG ? 'DEBUG' : 'PRODUCTION'} mode`, '');
  } catch (err) {
    logger.error('Failed to start server', err, '');
    process.exit(1);
  }
}
