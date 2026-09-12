const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong and latency!'),
  async execute(interaction) {
    const reply = await interaction.reply({ content: 'Pinging...', withResponse: true });
    const latency = reply.resource.message.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`Pong! 🏓\nLatency: **${latency}ms**`);
  },
};