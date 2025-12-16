const { SlashCommandBuilder, EmbedBuilder, version: djsversion } = require('discord.js');
const botVersion = '3.5.0 (Ark Manager Ultimate)'; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('🤖 Muestra la lista completa de funciones y estado del bot.'),

    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Cargando información...', fetchReply: true });
        const ping = sent.createdTimestamp - interaction.createdTimestamp;

        const embed = new EmbedBuilder()
            .setColor('#00BFFF') // Deep Sky Blue
            .setTitle(`🤖 Panel de Control de ${interaction.client.user.username}`)
            .setDescription('Sistema integral para la gestión de servidores de Ark: Survival Evolved/Ascended.\nAutomatización de roles, tribus, sanciones y economía.')
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .addFields(
                { 
                    name: '📊 Estado del Sistema', 
                    value: `**Ping:** ${ping}ms\n**Servidores:** ${interaction.client.guilds.cache.size}\n**Versión:** ${botVersion}`, 
                    inline: false 
                },
                {
                    name: '🦖 Supervivencia & Tribus',
                    value: '`/tribu` - Gestión completa (Info, Check-in, Reclutar, Votar...)\n`/infoplayer` - Ficha personal (ID, Warns, Kit)\n`/kit` - Estado de entrega de starter kits',
                    inline: false
                },
                {
                    name: '⚔️ Diplomacia & Comercio',
                    value: '`/diplomacia` - Alianzas, Declarar Guerra y **Alertas de Raid**\n`/mercado` - Publicar ofertas de compra/venta',
                    inline: false
                },
                {
                    name: '🛡️ Moderación & Seguridad',
                    value: '`/warn` / `/unwarn` - Sistema de advertencias (Ban temporal por acumulación)\n`/permaban` / `/unpermaban` - **Lista Negra** persistente tras Wipes\n`/mute` / `/unmute` - Aislamiento temporal (Timeout)\n`/banlist` - Ver lista de vetados permanentes',
                    inline: false
                },
                {
                    name: '⚙️ Administración del Servidor',
                    value: '`/setup` - Instalación inicial\n`/adminconfig` - Límites de miembros y alianzas\n`/newseason` - Reinicio de temporada (Amnistía de Warns)\n`/fullwipe` - Borrado total (Season 0)\n`/historycheck` - Consultar logs de seasons pasadas',
                    inline: false
                },
                {
                    name: '🔗 Enlaces de Interés',
                    value: '[Soporte Oficial](https://discord.gg/pBPRS64GKq)',
                    inline: false
                }
            )
            .setFooter({ text: `Solicitado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.editReply({ content: null, embeds: [embed] });
    },
};
