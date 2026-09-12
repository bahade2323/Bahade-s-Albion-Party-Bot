require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, Collection, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');

// 1. Initialize Express Server for Render Web Service (Keeps bot alive via HTTP)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Discord bot is active and running on Render!');
});

app.listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
});

// 2. Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

// Load command files from commands/ directory
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const commandsData = [];

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    commandsData.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Dynamic Guild Registration Helper
async function registerGuildCommands(guildId, guildName) {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
      { body: commandsData }
    );
    console.log(`Registered commands for: ${guildName}`);
  } catch (error) {
    console.error(`Failed to register commands in guild ${guildId}:`, error);
  }
}

// Relative UTC Time Parser
function parseUtcToDiscordTimestamp(timeString) {
  const match = timeString.trim().match(/^(\d{1,2})\s*UTC(?:\s+(\d+)\s*days?)?$/i);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const daysToAdd = match[2] ? parseInt(match[2], 10) : 0;

  const now = new Date();
  const targetDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysToAdd,
    hours,
    0,
    0
  ));

  if (daysToAdd === 0 && targetDate.getTime() < now.getTime()) {
    targetDate.setUTCDate(targetDate.getUTCDate() + 1);
  }

  const unixSeconds = Math.floor(targetDate.getTime() / 1000);
  return `<t:${unixSeconds}:R>`;
}

// Client Events
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  for (const [guildId, guild] of client.guilds.cache) {
    await registerGuildCommands(guildId, guild.name);
  }
});

client.on('guildCreate', async (guild) => {
  await registerGuildCommands(guild.id, guild.name);
});

// Interaction Router
client.on('interactionCreate', async (interaction) => {
  // 1. Slash Commands
  if (interaction.isChatInputCommand()) {
    // Prevent running /createparty inside threads
    if (interaction.commandName === 'createparty' && interaction.channel.isThread()) {
      return interaction.reply({
        content: '⚠️ **You cannot create a party inside an existing thread!** Please run `/createparty` in an open text channel or VC text chat.',
        flags: 64 // Ephemeral response
      });
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
    }
    return;
  }

  // 2. Modal Submissions
  if (interaction.isModalSubmit() && interaction.customId === 'party_modal') {
    if (interaction.channel.isThread()) {
      return interaction.reply({
        content: '⚠️ **Cannot create a party thread inside another thread.** Please execute `/createparty` in a standard channel.',
        flags: 64
      });
    }

    const title = interaction.fields.getTextInputValue('party_title');
    const rolesRaw = interaction.fields.getTextInputValue('party_roles');
    const massingRaw = interaction.fields.getTextInputValue('party_massing');
    const customThreadName = interaction.fields.getTextInputValue('party_thread');

    const relativeTimer = parseUtcToDiscordTimestamp(massingRaw) || massingRaw;

    const rolesList = rolesRaw
      .split('\n')
      .map(role => role.trim())
      .filter(role => role.length > 0)
      .map((role, idx) => `${idx + 1}.${role}-`)
      .join('\n');

    const messageContent = `Organizer ${interaction.user}\n\n${title}\n\n${rolesList}\n\n**Massing:** ${relativeTimer}`;

    // Fix deprecated fetchReply syntax with withResponse
    const replyResponse = await interaction.reply({
      content: messageContent,
      withResponse: true,
    });
    const partyMessage = replyResponse.resource.message;

    // Create Thread & Post Instruction Embed
    try {
      const threadName = customThreadName && customThreadName.trim() !== '' ? customThreadName : title;
      const thread = await partyMessage.startThread({
        name: threadName,
        autoArchiveDuration: 1440,
      });

      const instructionEmbed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('Register for role')
        .setDescription(
          `⚠️ **Note:** You can use registration commands in **threads**, **open text chats**, or **Voice Channel (VC) text chats**!\n\n` +
          `*You should ping bot!*\n*Or Reply to this message*\n\n` +
          `**For member**\n` +
          `Register to 3 role / re-register from any to 3 role:\n` +
          `> <@${client.user.id}> 3\n\n` +
          `Unregister from role:\n` +
          `> <@${client.user.id}> -\n\n` +
          `**For organizer**\n` +
          `Register @user to 2 role / re-register anyone from 2 role to @user:\n` +
          `> <@${client.user.id}> +2 @user\n\n` +
          `Unregister anyone from 5 role:\n` +
          `> <@${client.user.id}> -5`
        );

      await thread.send({ embeds: [instructionEmbed] });
    } catch (err) {
      console.error('Failed to create thread:', err);
    }
  }
});

// Listener for Role Commands across Channels, Threads, and VC Chats
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const isPinged = message.mentions.has(client.user);
  let isReply = false;
  
  if (message.reference) {
    const fetchedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (fetchedMsg && fetchedMsg.author.id === client.user.id) {
      isReply = true;
    }
  }

  if (!isPinged && !isReply) return;

  let parentMessage = null;

  if (message.channel.isThread()) {
    parentMessage = await message.channel.fetchStarterMessage().catch(() => null);
  } else if (isReply && message.reference) {
    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (repliedMsg && repliedMsg.author.id === client.user.id && repliedMsg.content.includes('Organizer')) {
      parentMessage = repliedMsg;
    }
  }

  if (!parentMessage) return;

  const text = message.content.replace(`<@${client.user.id}>`, '').replace(`<@!${client.user.id}>`, '').trim();
  const mentionedUser = message.mentions.users.filter(u => u.id !== client.user.id).first();

  let lines = parentMessage.content.split('\n');
  let updated = false;

  // Unregister user: @Bot -
  if (text === '-') {
    const targetUser = message.author;
    lines = lines.map(line => {
      if (/^\d+\./.test(line)) {
        return line.replace(new RegExp(`\\s*${targetUser}`, 'g'), '');
      }
      return line;
    });
    updated = true;
  }
  // Clear specific slot: @Bot -5
  else if (/^-\d+$/.test(text)) {
    const slotNum = text.replace('-', '');
    lines = lines.map(line => {
      if (line.startsWith(`${slotNum}.`)) {
        const parts = line.split('-');
        return `${parts[0]}-`;
      }
      return line;
    });
    updated = true;
  }
  // Register user: @Bot 3 or @Bot +2 @user
  else {
    const match = text.match(/^(\+)?(\d+)/);
    if (match) {
      const slotNum = match[2];
      const targetUser = mentionedUser || message.author;

      lines = lines.map(line => {
        if (/^\d+\./.test(line)) {
          return line.replace(new RegExp(`\\s*${targetUser}`, 'g'), '');
        }
        return line;
      });

      lines = lines.map(line => {
        if (line.startsWith(`${slotNum}.`)) {
          const parts = line.split('-');
          return `${parts[0]}- ${targetUser}`;
        }
        return line;
      });
      updated = true;
    }
  }

  if (updated) {
    await parentMessage.edit(lines.join('\n'));
    await message.react('✅').catch(() => null);
  }
});

client.login(process.env.DISCORD_TOKEN);