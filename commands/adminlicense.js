const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { addPremium, removePremium, isPremium, setUnlimited } = require('../utils/dataManager');

// 🔒 TU ID REAL
const OWNER_ID = '749826568477474888'; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adminlicense')
        .setDescription('🔒 ADMIN: Gestionar licencias y facturación.')
        .addSubcommand(s => s.setName('add').setDescription('➕ Añadir cliente (Modo Mensual por defecto)').addStringOption(o => o.setName('server_id').setRequired(true).setDescription('ID Servidor')).addStringOption(o => o.setName('cliente').setRequired(true).setDescription('Nombre Cliente')))
        .addSubcommand(s => s.setName('remove').setDescription('❌ Quitar licencia (Bot deja de funcionar)').addStringOption(o => o.setName('server_id').setRequired(true).setDescription('ID Servidor')))
        .addSubcommand(s => s.setName('check').setDescription('🔍 Verificar estado').addStringOption(o => o.setName('server_id').setRequired(true).setDescription('ID Servidor')))
        .addSubcommand(s => s.setName('unlimited').setDescription('♾️ Cambiar a ILIMITADO (Desactiva avisos de cobro)').addStringOption(o => o.setName('server_id').setRequired(true).setDescription('ID Servidor')))
        .addSubcommand(s => s.setName('monthly').setDescription('📅 Cambiar a MENSUAL (Activa avisos cada 30 días)').addStringOption(o => o.setName('server_id').setRequired(true).setDescription('ID Servidor'))),

    async execute(interaction) {
        if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '⛔ Acceso denegado.', ephemeral: true });

        const sub = interaction.options.getSubcommand();
        const targetGuildId = interaction.options.getString('server_id');

        if (sub === 'add') {
            const clientName = interaction.options.getString('cliente');
            addPremium(targetGuildId, clientName);
            return interaction.reply(`✅ **Licencia Mensual Activada.**\n👤 Cliente: **${clientName}**\n🆔 ID: \`${targetGuildId}\`\n📅 Aviso de cobro: En 30 días.`);
        }

        if (sub === 'remove') {
            removePremium(targetGuildId);
            return interaction.reply(`💀 **Licencia Revocada.**\nEl bot dejará de funcionar en \`${targetGuildId}\`.`);
        }

        if (sub === 'unlimited') {
            if (!isPremium(targetGuildId)) return interaction.reply('❌ Ese servidor no tiene licencia activa. Añádelo primero.');
            setUnlimited(targetGuildId, true);
            return interaction.reply(`♾️ **MODO ILIMITADO ACTIVADO.**\nServidor: \`${targetGuildId}\`\n✅ El bot **NO** enviará avisos de pago para este cliente.`);
        }

        if (sub === 'monthly') {
            if (!isPremium(targetGuildId)) return interaction.reply('❌ Ese servidor no tiene licencia activa.');
            setUnlimited(targetGuildId, false);
            return interaction.reply(`💲 **MODO MENSUAL ACTIVADO.**\nServidor: \`${targetGuildId}\`\n⚠️ Volverás a recibir alertas de cobro cada 30 días.`);
        }

        if (sub === 'check') {
            const status = isPremium(targetGuildId);
            return interaction.reply(status ? `✅ El servidor \`${targetGuildId}\` tiene licencia ACTIVA.` : `❌ El servidor \`${targetGuildId}\` NO tiene licencia.`);
        }
    },
};