const { EmbedBuilder } = require('discord.js');
const { getStatusPanel, getArkServers } = require('./dataManager');
const { sendRconCommand } = require('./rconManager');

async function updateStatusPanels(client) {
    // Recorremos todos los servidores de Discord donde está el bot
    for (const guild of client.guilds.cache.values()) {
        try {
            // 1. Verificar si este servidor tiene panel configurado
            const panelData = getStatusPanel(guild.id);
            if (!panelData) continue;

            const channel = await guild.channels.fetch(panelData.channel_id).catch(() => null);
            if (!channel) continue;

            const message = await channel.messages.fetch(panelData.message_id).catch(() => null);
            if (!message) continue;

            // 2. Obtener datos de los servidores Ark
            const arkServers = getArkServers(guild.id);
            if (!arkServers || arkServers.length === 0) {
                await message.edit({ embeds: [new EmbedBuilder().setTitle('📡 Estado').setDescription('❌ No hay servidores vinculados (/setupark).').setColor('Red')] });
                continue;
            }

            // 3. Consultar RCON (ListPlayers)
            // Usamos tu función existente sendRconCommand
            // Nota: ListPlayers devuelve algo como "No Players Connected" o "0. Name, 12345..."
            const rconResult = await sendRconCommand(guild.id, 'ListPlayers');
            
            const embed = new EmbedBuilder()
                .setTitle('🦕 Estado del Cluster Ark')
                .setColor('#00BFFF') // Azul brillante
                .setThumbnail(guild.iconURL())
                .setFooter({ text: 'Actualizado automáticamente • FlowShadow' })
                .setTimestamp();

            let totalOnline = 0;

            // Procesar resultados por cada mapa
            if (rconResult.rawResults) {
                for (const res of rconResult.rawResults) {
                    const serverName = res.server;
                    let statusIcon = '🟢';
                    let statusText = 'En Línea';
                    let playersText = 'Sin jugadores';
                    let count = 0;

                    if (!res.success) {
                        statusIcon = '🔴';
                        statusText = 'Fuera de Línea / Error RCON';
                        playersText = '-';
                    } else {
                        // Analizar respuesta de Ark
                        const lines = (res.response || "").split('\n').filter(l => l.includes(','));
                        count = lines.length;
                        totalOnline += count;

                        if (count > 0) {
                            // Formato bonito de lista: "Nombre (Tribu)"
                            // Recortamos para que no sature el embed si hay 70 personas
                            const displayNames = lines.slice(0, 10).map(line => {
                                const parts = line.split(','); 
                                // Ark devuelve: "0. Nombre, ID"
                                return `👤 ${parts[0].split('.')[1]?.trim() || parts[0].trim()}`;
                            });
                            
                            playersText = displayNames.join('\n');
                            if (count > 10) playersText += `\n... y ${count - 10} más`;
                        }
                    }

                    embed.addFields({
                        name: `${statusIcon} ${serverName}`,
                        value: `**IP:** Oculta (Segura)\n**Estado:** ${statusText}\n**Jugadores:** ${count}\n\n${playersText}`,
                        inline: true
                    });
                }
            }

            embed.setDescription(`🌍 **Jugadores Totales en Cluster:** ${totalOnline}`);

            // 4. Editar el mensaje
            await message.edit({ embeds: [embed] });

        } catch (e) {
            console.error(`Error actualizando status en ${guild.name}:`, e.message);
        }
    }
}

module.exports = { updateStatusPanels };
