const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { loadGuildConfig, saveGuildConfig } = require('../utils/dataManager'); // <--- NUEVO

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createprotected')
        .setDescription('Crea rol protegido del wipe.')
        .addUserOption(o => o.setName('usuario').setRequired(true).setDescription('Usuario'))
        .addStringOption(o => o.setName('nombre_rol').setRequired(true).setDescription('Nombre'))
        .addStringOption(o => o.setName('color').setDescription('Color (Hex)')),
    
    async execute(interaction) {
        const guild = interaction.guild;
        const config = loadGuildConfig(guild.id);
        if (!config) return interaction.reply({ content: '❌ Usa /setup primero.', flags: MessageFlags.Ephemeral });

        const member = interaction.options.getMember('usuario');
        const name = interaction.options.getString('nombre_rol');
        const color = interaction.options.getString('color') || 'Gold';

        await interaction.deferReply();
        try {
            const role = await guild.roles.create({ name, color, reason: 'Rol Protegido' });
            await member.roles.add(role);

            // Guardar en protected roles
            if (!config.roles.protected) config.roles.protected = [];
            if (!config.roles.protected.includes(role.id)) { // Guardamos ID ahora, mejor que nombre
                config.roles.protected.push(role.id);
                saveGuildConfig(guild.id, config);
            }

            interaction.editReply(`✅ Rol **${name}** creado, asignado a ${member} y protegido.`);
        } catch (e) {
            interaction.editReply(`❌ Error: ${e.message}`);
        }
    }
};