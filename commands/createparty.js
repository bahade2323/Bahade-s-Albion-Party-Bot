const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create_party')
    .setDescription('Creates a new raid or party event'),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('party_modal')
      .setTitle('Create Party');

    // Content Title / Header
    const titleInput = new TextInputBuilder()
      .setCustomId('party_title')
      .setLabel('Party Header')
      .setPlaceholder('Type here header')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    // Party Roles
    const rolesInput = new TextInputBuilder()
      .setCustomId('party_roles')
      .setLabel('Party Roles')
      .setPlaceholder('Type here roles to add. Example:\nTank\nHeal\nDamage')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    // Massing Time
    const massingInput = new TextInputBuilder()
      .setCustomId('party_massing')
      .setLabel('Massing Time')
      .setPlaceholder('Example: 10 UTC, 10UTC 1 day, or 10 UTC 5 days')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    // Thread Name
    const threadInput = new TextInputBuilder()
      .setCustomId('party_thread')
      .setLabel('Thread Name (Optional)')
      .setPlaceholder('Defaults to Party Header if empty')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    // Build modal rows
    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(rolesInput),
      new ActionRowBuilder().addComponents(massingInput),
      new ActionRowBuilder().addComponents(threadInput)
    );

    await interaction.showModal(modal);
  },
};