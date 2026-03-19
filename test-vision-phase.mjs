/**
 * Test Script for Task 5: Vision Phase
 * 
 * Tests Vision phase functionality:
 * 1. Welcome message when entering STATE_ONBOARDING
 * 2. AI validation (accepted/clarification)
 * 3. 5 message limit
 * 4. Fallback mode (without API key)
 * 5. Chat history context
 * 6. Vision saving
 * 7. Timeout keyboard
 */

import 'dotenv/config';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TEST_USER_ID = process.env.TEST_USER_ID;

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not set');
  process.exit(1);
}

if (!TEST_USER_ID) {
  console.error('❌ TEST_USER_ID not set');
  console.log('Set TEST_USER_ID environment variable with your Telegram user ID');
  process.exit(1);
}

const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
let testResults = [];
let currentTest = 0;

/**
 * Send message to Telegram API
 */
async function sendApiRequest(method, params = {}) {
  const url = `${BASE_URL}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return response.json();
}

/**
 * Send a text message
 */
async function sendMessage(text) {
  const result = await sendApiRequest('sendMessage', {
    chat_id: TEST_USER_ID,
    text,
  });
  return result;
}

/**
 * Get updates (polling)
 */
async function getUpdates(offset = 0, timeout = 5) {
  const result = await sendApiRequest('getUpdates', {
    offset,
    timeout,
    allowed_updates: ['message', 'callback_query'],
  });
  return result;
}

/**
 * Test helper: log result
 */
function logTest(name, passed, details = '') {
  currentTest++;
  const status = passed ? '✅' : '❌';
  const message = `${status} Test ${currentTest}: ${name}`;
  console.log(message + (details ? ` - ${details}` : ''));
  testResults.push({ test: currentTest, name, passed, details });
}

/**
 * Wait for user message
 */
async function waitForUserMessage(timeout = 30000) {
  const startTime = Date.now();
  let lastUpdateId = 0;
  
  while (Date.now() - startTime < timeout) {
    const result = await getUpdates(lastUpdateId + 1, 1);
    if (result.ok && result.result.length > 0) {
      for (const update of result.result) {
        lastUpdateId = update.update_id;
        if (update.message && update.message.from.id.toString() === TEST_USER_ID) {
          return update.message;
        }
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

/**
 * Send callback query (simulate button press)
 */
async function sendCallback(callbackData, messageId) {
  // Note: We can't directly send callbacks - user must press button
  // This test requires manual interaction
  console.log(`   [Manual] Please click button with callback_data: ${callbackData}`);
  return true;
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n========================================');
  console.log('  Task 5: Vision Phase Tests');
  console.log('========================================\n');
  
  console.log('📋 Test Configuration:');
  console.log(`   Bot Token: ${BOT_TOKEN ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Test User ID: ${TEST_USER_ID}`);
  console.log(`   LLM API Key: ${process.env.LLM_API_KEY ? '✅ Set' : '⚠️  Not set (fallback mode)'}`);
  console.log('\n');
  
  // Test 1: Check bot is running
  console.log('Test 1: Checking bot status...');
  const me = await sendApiRequest('getMe');
  if (me.ok) {
    logTest('Bot is running', true, `@${me.result.username}`);
  } else {
    logTest('Bot is running', false, me.description);
    return;
  }
  
  // Test 2-7: Manual testing instructions
  console.log('\n========================================');
  console.log('  Manual Test Scenarios');
  console.log('========================================\n');
  
  console.log('📝 Please follow these steps manually:\n');
  
  console.log('Test 2: Welcome message in STATE_ONBOARDING');
  console.log('   1. Send /start to the bot');
  console.log('   2. Click through all 5 HELLO messages');
  console.log('   3. Click through both DECISION messages');
  console.log('   4. Verify you see the Vision welcome message:');
  console.log('      "Тебе нужно прислать мне свой Vision..."\n');
  
  console.log('Test 3: AI validation (accepted)');
  console.log('   1. Send: "Через 12 недель я хочу свободно говорить на английском и получить повышение на работе"');
  console.log('   2. Verify AI responds with acceptance message\n');
  
  console.log('Test 4: AI validation (needs clarification)');
  console.log('   1. Send: "Хочу выучить язык"');
  console.log('   2. Verify AI asks for clarification\n');
  
  console.log('Test 5: Message limit (5 messages)');
  console.log('   1. Send 5 short/unclear messages');
  console.log('   2. Verify after 5th message you see timeout:');
  console.log('      "Вижу, тебе сложно сформулировать вижн..."');
  console.log('   3. Verify you see 3 inline buttons:\n');
  console.log('      - Почитать про вижн');
  console.log('      - Попробовать ещё раз');
  console.log('      - Предложи свой вариант\n');
  
  console.log('Test 6: Timeout buttons (stubs)');
  console.log('   1. Click each of the 3 timeout buttons');
  console.log('   2. Verify each shows: "Эта функция будет доступна в следующей версии"\n');
  
  console.log('Test 7: Fallback mode (without LLM_API_KEY)');
  console.log('   1. Restart bot without LLM_API_KEY');
  console.log('   2. Go through Vision phase');
  console.log('   3. Verify fallback message: "Спасибо! Я пока не могу проверить твой Vision..."\n');
  
  // AI Module Unit Tests
  console.log('\n========================================');
  console.log('  Unit Tests (AI Module)');
  console.log('========================================\n');
  
  // Import AI module functions
  const { isAIAvailable, getAIConfig } = await import('./src/bot/ai/config.ts');
  const { isVisionAccepted } = await import('./src/bot/onboarding/prompts/vision.ts');
  
  // Test 8: isVisionAccepted
  const acceptedResponses = [
    'Отличный вижн, принимаю!',
    'Принято! Это звучит как настоящая цель.',
    'Супер, мне нравится!',
    'Звучит хорошо!',
  ];
  
  let allAccepted = true;
  for (const response of acceptedResponses) {
    const result = isVisionAccepted(response);
    if (!result) {
      console.log(`   Failed: "${response}" not accepted`);
      allAccepted = false;
    }
  }
  logTest('isVisionAccepted (positive cases)', allAccepted);
  
  const rejectedResponses = [
    'А что именно ты хочешь достичь?',
    'Расскажи подробнее о своих целях',
    'Не совсем понятно...',
  ];
  
  let allRejected = true;
  for (const response of rejectedResponses) {
    const result = isVisionAccepted(response);
    if (result) {
      console.log(`   Failed: "${response}" incorrectly accepted`);
      allRejected = false;
    }
  }
  logTest('isVisionAccepted (negative cases)', allRejected);
  
  // Test 9: AI Config
  const config = getAIConfig();
  logTest('AI Config loads', !!config.baseUrl && !!config.model);
  
  // Test 10: AI Available check
  const available = isAIAvailable();
  logTest('AI availability check works', typeof available === 'boolean');
  
  // Summary
  console.log('\n========================================');
  console.log('  Test Summary');
  console.log('========================================\n');
  
  const passed = testResults.filter(r => r.passed).length;
  const total = testResults.length;
  
  console.log(`Total: ${passed}/${total} tests passed`);
  
  if (passed < total) {
    console.log('\n❌ Some tests failed. Check details above.');
  } else {
    console.log('\n✅ All automated tests passed!');
  }
  
  console.log('\n⚠️  Manual tests require your interaction with the bot.');
  console.log('    Follow the instructions above to complete manual testing.\n');
}

// Run tests
runTests().catch(console.error);
