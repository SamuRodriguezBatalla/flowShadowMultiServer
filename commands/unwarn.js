const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { removeWarning } = require('../utils/warnings');
const { loadTribes } = require('../utils/dataManager'); // <--- NUEVO

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unwarn')
        .setDescription('Remueve advertencia.')
        .addStringOption(o => o.setName('tipo').setDescription('Tipo').setRequired(true)
            .addChoices({ name: 'Leve (-1)', value: 'leve' }, { name: 'Media (-2)', value: 'media' }, { name: 'Grave (-4)', value: 'grave' }))
        .addUserOption(o => o.setName('usuario').setDescription('Usuario'))
        .addRoleOption(o => o.setName('rol_tribu').setDescription('Rol Tribu'))
        .addStringOption(o => o.setName('nombre_tribu').setDescription('Nombre manual').setAutocomplete(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const tribes = loadTribes(interaction.guild.id); // <--- CARGA DINÁMICA
        const choices = Object.keys(tribes);
        const filtered = choices.filter(choice => choice.toLowerCase().includes(focusedValue.toLowerCase()));
        await interaction.respond(filtered.slice(0, 25).map(choice => ({ name: choice, value: choice })));
    },

    async execute(interaction) {
        const type = interaction.options.getString('tipo');
        const user = interaction.options.getUser('usuario');
        const role = interaction.options.getRole('rol_tribu');
        const str = interaction.options.getString('nombre_tribu');

        if ([user, role, str].filter(i => i !== null).length !== 1) return interaction.reply({ content: '❌ Elige solo uno.', flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let result;
        if (user) result = await removeWarning(interaction.guild, 'member', user.id, type);
        else result = await removeWarning(interaction.guild, 'tribe', role ? role.name : str, type);

        if (result.success) interaction.followUp(`💚 Warn removido. ${result.message}`);
        else interaction.followUp(`❌ Error: ${result.message}`);
    },
};