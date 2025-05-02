// Custom Resource Lambda - Version 2.0 - Updated to handle ARN format
const AWS = require('aws-sdk');
const https = require('https');
const url = require('url');

// Helper function to send response to CloudFormation
function sendResponse(event, context, responseStatus, responseData, physicalResourceId, reason) {
  const responseBody = JSON.stringify({
    Status: responseStatus,
    Reason: reason || 'See the details in CloudWatch Log Stream: ' + context.logStreamName,
    PhysicalResourceId: physicalResourceId || context.logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    NoEcho: false,
    Data: responseData
  });

  console.log('Response body:\n', responseBody);

  const parsedUrl = url.parse(event.ResponseURL);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: 'PUT',
    headers: {
      'content-type': '',
      'content-length': responseBody.length
    }
  };

  return new Promise((resolve, reject) => {
    const request = https.request(options, function(response) {
      console.log('Status code: ' + response.statusCode);
      console.log('Status message: ' + response.statusMessage);
      context.done();
      resolve();
    });

    request.on('error', function(error) {
      console.log('send(..) failed executing https.request(..): ' + error);
      context.done();
      reject(error);
    });

    request.write(responseBody);
    request.end();
  });
}

exports.handler = async function(event, context) {
  console.log('REQUEST RECEIVED:\n' + JSON.stringify(event));
  
  // For Delete requests, immediately send a success response
  if (event.RequestType === 'Delete') {
    await sendResponse(event, context, 'SUCCESS', {}, event.PhysicalResourceId);
    return;
  }

  try {
    // Get properties from the event
    const props = event.ResourceProperties;
    let lambdaFunctionName = props.LambdaFunctionName;
    const apiGatewayUrl = props.ApiGatewayUrl;
    const webSocketApiUrl = props.WebSocketApiUrl;
    
    // If lambdaFunctionName is an ARN, extract the function name
    if (lambdaFunctionName && lambdaFunctionName.includes('arn:aws:lambda')) {
      lambdaFunctionName = lambdaFunctionName.split(':').pop();
      console.log(`Extracted function name from ARN: ${lambdaFunctionName}`);
    }
    
    // Extract the domain from the URL (remove https:// and trailing /)
    const domain = apiGatewayUrl.replace('https://', '').replace(/\/$/, '').trim();
    
    // Extract the WebSocket URL (ensure it has wss:// prefix and no spaces)
    const wsUrl = webSocketApiUrl.startsWith('wss://') 
      ? webSocketApiUrl.trim() 
      : `wss://${webSocketApiUrl.trim()}`;
    
    // Log the extracted values for debugging
    console.log(`Extracted domain: "${domain}"`);
    console.log(`Extracted WebSocket URL: "${wsUrl}"`);
    
    // Ensure there are no spaces in the URLs
    const cleanDomain = domain.replace(/\s+/g, '');
    const cleanWsUrl = wsUrl.replace(/\s+/g, '');
    
    console.log(`Updating Lambda function ${lambdaFunctionName} with domain ${cleanDomain} and WebSocket URL ${cleanWsUrl}`);
    
    // Initialize AWS Lambda client
    const lambda = new AWS.Lambda();
    
    // Get current Lambda configuration to preserve other environment variables
    const functionConfig = await lambda.getFunctionConfiguration({
      FunctionName: lambdaFunctionName
    }).promise();
    
    const currentEnvVars = functionConfig.Environment ? functionConfig.Environment.Variables : {};
    console.log('Current environment variables:', currentEnvVars);
    
    // Update the environment variables
    const updatedEnvVars = {
      ...currentEnvVars,
      DOMAIN: cleanDomain,
      WS_URL: cleanWsUrl
    };
    
    // Update the Lambda function configuration
    console.log('Updating Lambda function configuration with:', {
      FunctionName: lambdaFunctionName,
      Environment: {
        Variables: {
          ...updatedEnvVars,
          DOMAIN: cleanDomain,
          WS_URL: cleanWsUrl
        }
      }
    });
    
    try {
      const updateResult = await lambda.updateFunctionConfiguration({
        FunctionName: lambdaFunctionName,
        Environment: {
          Variables: updatedEnvVars
        }
      }).promise();
      
      console.log('Update result:', JSON.stringify(updateResult, null, 2));
      console.log('Successfully updated Lambda environment variables');
      
      // Verify the update by getting the function configuration again
      const verifyConfig = await lambda.getFunctionConfiguration({
        FunctionName: lambdaFunctionName
      }).promise();
      
      console.log('Verification - updated environment variables:', verifyConfig.Environment ? verifyConfig.Environment.Variables : {});
    } catch (updateError) {
      console.error('Error updating Lambda function configuration:', updateError);
      throw updateError;
    }
    
    // Send success response to CloudFormation
    await sendResponse(event, context, 'SUCCESS', {
      Message: `Successfully updated Lambda function ${lambdaFunctionName} with domain ${cleanDomain} and WebSocket URL ${cleanWsUrl}`
    });
  } catch (error) {
    console.error('Error:', error);
    
    // Send failure response to CloudFormation
    await sendResponse(event, context, 'FAILED', {}, null, error.message);
  }
};
