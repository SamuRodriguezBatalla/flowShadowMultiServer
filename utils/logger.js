const { EmbedBuilder } = require('discord.js');
const { loadTribes, loadGuildConfig } = require('./dataManager');
const { BAN_THRESHOLD } = require('./constants');

async function updateLog(guild, client) {
    const config = loadGuildConfig(guild.id);
    if (!config || !config.channels.log) return;

    const logChannel = guild.channels.cache.get(config.channels.log);
    if (!logChannel) return;

    const tribes = loadTribes(guild.id);
    const sorted = Object.keys(tribes).sort();
    const embeds = [];
    const ITEMS = 25;

    // Generar páginas de logs
    for (let i = 0; i < Math.ceil(sorted.length / ITEMS); i++) {
        const embed = new EmbedBuilder().setColor('#9B59B6').setTitle(`📜 Registro Tribus | Pág ${i+1}`);
        const chunk = sorted.slice(i*ITEMS, (i+1)*ITEMS);

        for (const tName of chunk) {
            const t = tribes[tName];
            const tWarns = t.warnings || 0;
            const list = t.members.map(m => {
                const tot = (m.warnings||0) + tWarns;
                const risk = tot >= BAN_THRESHOLD ? '🚨' : '';
                return `> ${m.rango==='Líder'?'👑':'👤'} **${m.username}** (ID: ${m.idPlay}) Warns: ${tot} ${risk}`;
            }).join('\n');
            
            embed.addFields({ name: `🛡️ ${tName} (${tWarns})`, value: list || 'Vacía', inline: true });
        }
        embeds.push(embed);
    }

    // Lógica de envío
    try {
        // Borrar último mensaje del bot para no spammear
        const msgs = await logChannel.messages.fetch({ limit: 5 });
        const myMsg = msgs.find(m => m.author.id === client.user.id);
        if (myMsg) await myMsg.delete();

        // CORRECCIÓN DEL ERROR 50006:
        if (embeds.length > 0) {
            // Si hay tribus, enviamos la lista
            await logChannel.send({ embeds });
        } else {
            // Si NO hay tribus, enviamos un mensaje de "Vacío" en lugar de nada
            await logChannel.send({ 
                embeds: [new EmbedBuilder()
                    .setTitle('📜 Registro de Tribus')
                    .setDescription('*La base de datos está vacía actualmente.*')
                    .setColor('Grey')
                    .setFooter({ text: 'Esperando nuevos registros...' })
                ]
            });
        }
    } catch (e) { console.error("Error en updateLog:", e.message); }
}

module.exports = { updateLog };