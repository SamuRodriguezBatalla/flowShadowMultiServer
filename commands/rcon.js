const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { sendRconCommand } = require('../utils/rconManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rcon')
        .setDescription('💻 Ejecuta un comando de consola en el servidor de Ark.')
        .addStringOption(o => o.setName('comando').setDescription('El comando a ejecutar (Ej: SaveWorld, DoExit, ListPlayers)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();
        const command = interaction.options.getString('comando');

        // Ejecutar
        const result = await sendRconCommand(interaction.guild.id, command);

        if (result.success) {
            // Ark a veces devuelve respuestas vacías si el comando es exitoso (ej: Broadcast)
            const output = result.response.trim() || '✅ Comando ejecutado (Sin respuesta del servidor).';
            
            const embed = new EmbedBuilder()
                .setTitle('💻 RCON Ejecutado')
                .setColor('Green')
                .addFields(
                    { name: '📥 Entrada', value: `\`${command}\`` },
                    { name: '📤 Salida', value: `\`\`\`\n${output.substring(0, 1000)}\n\`\`\`` } // Cortar si es muy largo
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply(`❌ **Error RCON:** ${result.message}`);
        }
    },
};
