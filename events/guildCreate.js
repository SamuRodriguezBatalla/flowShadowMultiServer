const { Events, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: Events.GuildCreate,
    async execute(guild) {
        // 1. Buscar un canal donde enviar el mensaje (SystemChannel o el primero de texto que encuentre)
        let channel = guild.systemChannel;
        
        if (!channel) {
            channel = guild.channels.cache.find(c => 
                c.type === ChannelType.GuildText && 
                c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)
            );
        }

        // 2. Diseñar la "Tarjeta de Visita"
        const welcomeEmbed = new EmbedBuilder()
            .setColor('#00BFFF') // Azul profesional
            .setTitle(`🦕 ¡Hola! Soy ${guild.client.user.username}`)
            .setDescription(`Gracias por invitarme a **${guild.name}**. Soy un bot especializado en la gestión de servidores de **Ark: Survival Evolved/Ascended**.\n\nMi trabajo es automatizar tribus, registros, logs y sanciones para que tú solo te preocupes de jugar.`)
            .setThumbnail(guild.client.user.displayAvatarURL())
            .addFields(
                { 
                    name: '⚙️ Primer Paso (Obligatorio)', 
                    value: 'Para empezar a funcionar, necesito configurar mis canales y roles. Ejecuta:\n### 🛠️ `/setup`' 
                },
                { 
                    name: '📋 Mis Funciones Principales', 
                    value: '🔹 **Gestión de Tribus:** Creación automática de canales y roles privados.\n🔹 **Logs:** Registro de todo lo que pasa en las tribus.\n🔹 **Sanciones:** Sistema de Warns y Baneos con puntuación.\n🔹 **Historial:** Guardado de Seasons pasadas.' 
                },
                { 
                    name: '🆘 ¿Necesitas Ayuda?', 
                    value: 'Usa el comando `/botinfo` en cualquier momento para ver esta tarjeta de nuevo.' 
                }
            )
            .setFooter({ text: 'Sistema BotArk • Multi-Server Edition' })
            .setTimestamp();

        // 3. Enviar el mensaje
        if (channel) {
            await channel.send({ embeds: [welcomeEmbed] }).catch(console.error);
        } else {
            // Si no encuentra canal, intenta enviárselo al dueño por DM
            const owner = await guild.fetchOwner();
            await owner.send({ embeds: [welcomeEmbed] }).catch(console.error);
        }
        
        console.log(`📥 Me he unido a un nuevo servidor: ${guild.name} (ID: ${guild.id})`);
    },
};