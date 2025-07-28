const mineflayer = require('mineflayer');
const fs = require('fs');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const path = require('path');

const configPath = path.join(process.cwd(), 'settings.json');
if (!fs.existsSync(configPath)) {
  console.error('Missing settings.json in current directory!');
  process.exit(1);
}
const configRaw = fs.readFileSync(configPath, 'utf-8');
const config = JSON.parse(configRaw);
const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.send('Bot has arrived');
});

app.listen(8000, () => {
  console.log('Server started');
});

function createBot() {
  const bot = mineflayer.createBot({
    username: config['bot-account']['username'],
    password: config['bot-account']['password'],
    auth: config['bot-account']['type'],
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    bot.settings.colorsEnabled = false;

    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);

    console.log('\x1b[33m[AfkBot] Bot joined the server', '\x1b[0m');

    let pendingPromise = Promise.resolve();

    function sendRegister(password) {
      return new Promise((resolve, reject) => {
        bot.chat(`/register ${password} ${password}`);
        console.log(`[Auth] Sent /register command.`);

        bot.once('chat', (username, message) => {
          console.log(`[ChatLog] <${username}> ${message}`);
          if (message.includes('successfully registered')) {
            console.log('[INFO] Registration confirmed.');
            resolve();
          } else if (message.includes('already registered')) {
            console.log('[INFO] Bot was already registered.');
            resolve();
          } else {
            reject(`Registration failed: ${message}`);
          }
        });
      });
    }

    function sendLogin(password) {
      return new Promise((resolve, reject) => {
        bot.chat(`/login ${password}`);
        console.log(`[Auth] Sent /login command.`);

        bot.once('chat', (username, message) => {
          console.log(`[ChatLog] <${username}> ${message}`);
          if (message.includes('successfully logged in')) {
            console.log('[INFO] Login successful.');
            resolve();
          } else {
            reject(`Login failed: ${message}`);
          }
        });
      });
    }

    if (config.utils['auto-auth'].enabled) {
      const password = config.utils['auto-auth'].password;
      pendingPromise = pendingPromise
        .then(() => sendRegister(password))
        .then(() => sendLogin(password))
        .catch(console.error);
    }

    if (config.utils['chat-messages'].enabled) {
      console.log('[INFO] Started chat-messages module');
      const messages = config.utils['chat-messages']['messages'];
      if (config.utils['chat-messages'].repeat) {
        const delay = config.utils['chat-messages']['repeat-delay'] * 1000;
        let i = 0;
        setInterval(() => {
          bot.chat(messages[i]);
          i = (i + 1) % messages.length;
        }, delay);
      } else {
        messages.forEach((msg) => bot.chat(msg));
      }
    }

    if (config.position.enabled) {
      const pos = config.position;
      console.log(`[AfkBot] Moving to (${pos.x}, ${pos.y}, ${pos.z})`);
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    }

    if (config.utils['anti-afk'].enabled) {
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) {
        bot.setControlState('sneak', true);
      }
    }
  });

  bot.on('goal_reached', () => {
    console.log(`[AfkBot] Reached goal at ${bot.entity.position}`);
  });

  bot.on('death', () => {
    console.log(`[AfkBot] Bot died and respawned at ${bot.entity.position}`);
  });

  if (config.utils['auto-reconnect']) {
    bot.on('end', () => {
      console.log('[AfkBot] Bot disconnected, reconnecting...');
      setTimeout(createBot, config.utils['auto-recconect-delay']);
    });
  }

  bot.on('kicked', (reason) => {
    console.log(`[AfkBot] Bot was kicked: ${reason}`);
  });

  bot.on('error', (err) => {
    console.log(`[ERROR] ${err.message}`);
  });
}

createBot();
