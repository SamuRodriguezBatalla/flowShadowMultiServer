const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { sendRconCommand } = require('../utils/rconManager');
const { loadTribes } = require('../utils/dataManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('online')
        .setDescription('🦖 Muestra jugadores conectados en todo el cluster.'),

    async execute(interaction) {
        await interaction.deferReply();
        
        // Envía comando a TODOS los servidores del cluster
        const result = await sendRconCommand(interaction.guild.id, 'ListPlayers');
        
        if (!result.success && !result.rawResults) return interaction.editReply(`❌ No hay conexión con ningún servidor.`);

        const tribes = loadTribes(interaction.guild.id);
        const embed = new EmbedBuilder().setTitle('🌍 Estado del Cluster').setColor('Green').setTimestamp();
        
        let totalPlayers = 0;

        // Iteramos por cada respuesta de cada servidor
        for (const res of result.rawResults) {
            let serverContent = "";
            
            if (!res.success) {
                serverContent = "🔴 *Offline / Error RCON*";
            } else {
                const lines = (res.response || "").split('\n').filter(l => l.includes(','));
                if (lines.length === 0) {
                    serverContent = "*Nadie conectado.*";
                } else {
                    totalPlayers += lines.length;
                    for (const line of lines) {
                        const parts = line.split(',');
                        if (parts.length < 2) continue;
                        
                        const arkName = parts[0].split('.')[1]?.trim() || parts[0].trim();
                        const arkId = parts[1].trim();
                        
                        let discordTag = "❓";
                        let tribeName = "";

                        for (const tName in tribes) {
                            const m = tribes[tName].members.find(x => x.idPlay === arkId);
                            if (m) {
                                discordTag = `<@${m.discordId}>`;
                                tribeName = `[${tName}]`;
                                break;
                            }
                        }
                        serverContent += `👤 **${arkName}** ${tribeName} ${discordTag}\n`;
                    }
                }
            }
            embed.addFields({ name: `🦖 ${res.server}`, value: serverContent, inline: false });
        }

        embed.setDescription(`**Total Online:** ${totalPlayers} supervivientes.`);
        await interaction.editReply({ embeds: [embed] });
    },
};
