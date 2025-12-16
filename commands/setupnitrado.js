const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { saveNitradoConfig, addNitradoServer, getNitradoServers } = require('../utils/dataManager');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupnitrado')
        .setDescription('🎮 Vincula tu cuenta de Nitrado y detecta tus servidores.')
        .addStringOption(o => o.setName('token').setDescription('Tu Token API').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const token = interaction.options.getString('token');
        const guildId = interaction.guild.id;

        try {
            // 1. Obtener servicios de la cuenta
            const res = await axios.get('https://api.nitrado.net/services', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const services = res.data.data.services;
            if (!services || services.length === 0) {
                return interaction.editReply('❌ Token válido, pero no hay servidores en esta cuenta.');
            }

            // 2. Filtrar solo los que sean juegos (Gameservers)
            // Ark suele tener type 'gameserver'
            const gameServers = services.filter(s => s.type === 'gameserver');

            if (gameServers.length === 0) return interaction.editReply('❌ No se encontraron servidores de juego activos.');

            // 3. Guardar Token Global
            saveNitradoConfig(guildId, token, services[0].username);

            // 4. Guardar cada servidor encontrado en la DB
            let msg = `✅ **¡Conexión Exitosa!**\n👤 Usuario: ${services[0].username}\n\n**Servidores detectados y vinculados:**\n`;
            
            for (const s of gameServers) {
                // Usamos el nombre que tiene puesto en Nitrado o el ID si no tiene
                const sName = s.details.name || `Ark-${s.id}`;
                addNitradoServer(guildId, sName, s.id);
                msg += `🦖 **${sName}** (ID: ${s.id})\n`;
            }

            msg += `\nAhora puedes usar comandos como \`/arkrestart\` o \`/online\` seleccionando el mapa específico.`;

            return interaction.editReply(msg);

        } catch (error) {
            console.error(error);
            return interaction.editReply('❌ Token inválido o error de conexión con Nitrado.');
        }
    },
};