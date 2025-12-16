const { Events, EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// 👇 ENLACE DE SOPORTE
const SUPPORT_INVITE_LINK = 'https://discord.gg/pBPRS64GKq';

module.exports = {
    name: Events.GuildCreate,
    async execute(guild) {
        // 1. Buscar canal de texto para enviar el mensaje
        let channel = guild.systemChannel;
        
        if (!channel) {
            channel = guild.channels.cache.find(c => 
                c.type === ChannelType.GuildText && 
                c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)
            );
        }

        // 2. Obtener la URL del Avatar del Bot (Tamaño grande para que se vea bien de banner)
        // Usamos size: 1024 para máxima calidad y forceStatic: false por si es un GIF animado
        const botAvatarUrl = guild.client.user.displayAvatarURL({ size: 1024, forceStatic: false });

        // 3. Botón de Soporte
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('📞 Servidor de Soporte')
                .setStyle(ButtonStyle.Link)
                .setURL(SUPPORT_INVITE_LINK)
        );

        // 4. Embed "FlowShadow"
        const welcomeEmbed = new EmbedBuilder()
            .setColor('#9D00FF') // Morado FlowShadow
            .setTitle(`🔮 FlowShadow ha llegado a ${guild.name}`)
            .setDescription(`Soy el sistema definitivo de gestión para servidores de **Ark**.
            A continuación te explico cómo configurarme y **dónde** usar cada comando.
            
            > **🚀 PASO 1: INSTALACIÓN (OBLIGATORIO)**
            > **Comando:** \`/setup\`
            > **📍 Dónde:** En este mismo canal.
            > **Qué hace:** Creará automáticamente las categorías, roles (Líder, Superviviente...) y canales necesarios.`)
            .setThumbnail(botAvatarUrl) // Miniatura arriba a la derecha (Avatar)
            .addFields(
                { name: '👑 Configuración del Servidor (Admins)', value: 
                    '**📍 Dónde:** Cualquier canal de admins.\n' +
                    '`/setupark` - Vincula tu servidor de Ark (necesitas IP, Puerto y RCON).\n' +
                    '`/unlinkark` - Borra los datos del servidor Ark.\n' +
                    '`/adminconfig` - Establece límites de miembros por tribu y alianzas.\n' +
                    '`/fixroles` - Si alguien no tiene rol, esto arregla sus permisos.\n' +
                    '`/newseason` - Inicia nueva temporada (Borra canales, guarda historial, quita warns).\n' +
                    '`/fullwipe` - ⚠️ Borrado total y reinicio a Season 0.'
                },
                { name: '🦖 Panel de Estado y RCON', value: 
                    '**📍 Dónde:** Canal específico (Ej: #estado-servidor).\n' +
                    '`/setupstatus` - **¡IMPORTANTE!** Ejecútalo DENTRO del canal donde quieres que aparezca el panel de estado en vivo.\n' +
                    '`/online` - Muestra lista de jugadores conectados.\n' +
                    '`/rcon` - Ejecuta comandos de consola (Cheat SaveWorld, etc).\n' +
                    '`/arkbroadcast` - Envía un mensaje a la pantalla de todos los jugadores en Ark.'
                },
                { name: '🛡️ Seguridad y Moderación', value: 
                    '**📍 Dónde:** Canales de logs o cualquier chat.\n' +
                    '`/arkban` - Banea de Ark y Discord a la vez.\n' +
                    '`/kick` - Expulsa del servidor de juego.\n' +
                    '`/permaban` - Añade a la Lista Negra (El usuario no podrá volver ni tras un Wipe).\n' +
                    '`/banlist` - Revisa quién está baneado.\n' +
                    '`/checkid` - Busca si hay IDs de Steam/PSN duplicadas en la base de datos.'
                },
                { name: '🦕 Gestión de Tribus (Para Líderes)', value: 
                    '**📍 Dónde:** En el canal privado de su tribu.\n' +
                    '`/tribu reclutar` - Invita a un jugador (le mete al canal y le da rol).\n' +
                    '`/tribu kick` - Saca a alguien de la tribu.\n' +
                    '`/tribu ascender` - Cede el liderazgo a otro.\n' +
                    '`/tribu rename` - Cambia el nombre de la tribu y del canal.\n' +
                    '`/diplomacia` - Gestiona alianzas o declara guerras (crea canales compartidos).'
                },
                { name: '👤 Supervivientes (Utilidades)', value: 
                    '**📍 Dónde:** Canales generales o de tribu.\n' +
                    '`/tribu checkin` - **Vital:** Renueva la actividad de la base para que no se borre.\n' +
                    '`/infoplayer` - Muestra tu ficha, ID registrada y Warns.\n' +
                    '`/mercado` - Crea un post de compra/venta con botón de contacto.\n' +
                    '`/report` - Abre un formulario secreto para reportar jugadores.\n' +
                    '`/suggestvote` - Crea una encuesta de Sí/No.'
                }
            )
            .setImage(botAvatarUrl) // <--- AQUÍ ESTÁ EL CAMBIO: Usa la misma URL del avatar en grande
            .setFooter({ text: 'FlowShadow System • Multi-Server Edition' })
            .setTimestamp();

        // 5. Enviar mensaje (Sin archivos adjuntos locales)
        try {
            if (channel) {
                await channel.send({ embeds: [welcomeEmbed], components: [row] });
            } else {
                const owner = await guild.fetchOwner();
                await owner.send({ embeds: [welcomeEmbed], components: [row] });
            }
            console.log(`📥 FlowShadow unido a: ${guild.name} (ID: ${guild.id})`);
        } catch (error) {
            console.error(`❌ Error enviando bienvenida en ${guild.name}:`, error.message);
        }
    },
};
