const { SlashCommandBuilder, EmbedBuilder, version: djsversion } = require('discord.js');
// Puedes crear un archivo package.json para leer la versión del bot si quieres, o ponerla a mano
const botVersion = '2.0.0 (Multi-Server)'; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('🤖 Muestra la tarjeta de información y funciones del bot.'),

    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Cargando información...', fetchReply: true });
        const ping = sent.createdTimestamp - interaction.createdTimestamp;

        const embed = new EmbedBuilder()
            .setColor('#FFD700') // Dorado
            .setTitle(`🤖 Información de ${interaction.client.user.username}`)
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setDescription('Soy un gestor automatizado de comunidades de Ark. Aquí tienes mis datos técnicos y funciones.')
            .addFields(
                { 
                    name: '📊 Estado del Sistema', 
                    value: `**Ping:** ${ping}ms\n**Servidores:** ${interaction.client.guilds.cache.size}\n**Versión:** ${botVersion}`, 
                    inline: true 
                },
                { 
                    name: '🛠️ Comandos Clave', 
                    value: '`/setup` - Instalación inicial (Solo Admin)\n`/tribu` - Gestión de tribus\n`/warn` - Sistema de sanciones\n`/newseason` - Reinicio de temporada', 
                    inline: false 
                },
                {
                    name: '🔗 Enlaces de Interés',
                    value: '[Soporte](https://discord.gg/tu-servidor-soporte) | [Invítame](https://discord.com/api/oauth2/authorize?client_id=1439686550177710234&permissions=8&scope=bot%20applications.commands)',
                    inline: false
                }
            )
            .setFooter({ text: `Solicitado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.editReply({ content: null, embeds: [embed] });
    },
};