const { ChannelType } = require('discord.js');
const { iniciarRegistro } = require('../events/guildMemberAdd'); 

async function sincronizarRegistros(guild, config) {
    const unverifiedRole = guild.roles.cache.get(config.roles.unverified);
    if (!unverifiedRole) return;

    console.log(`👮 [SyncManager] Iniciando barrido en ${guild.name}...`);

    // 1. Descarga COMPLETA de miembros (Fuerza bruta para encontrar a todos)
    let members;
    try {
        members = await guild.members.fetch();
    } catch (e) {
        console.log("⚠️ Error descargando miembros, usando caché.");
        members = guild.members.cache;
    }

    // 2. Filtramos: Tienen rol "No Verificado" Y NO son bots
    const targets = members.filter(m => m.roles.cache.has(unverifiedRole.id) && !m.user.bot);
    
    console.log(`📊 Usuarios 'No Verificados' encontrados: ${targets.size}`);

    // 3. Descarga COMPLETA de canales para no fallar en la búsqueda
    const channels = await guild.channels.fetch();

    for (const [id, member] of targets) {
        // Identificador único del usuario (últimos 4 dígitos o ID completo)
        const suffix = member.id.slice(-4);

        // ¿Tiene ya un canal? (Buscamos por Topic ID o por Nombre)
        const hasChannel = channels.some(c => {
            if (c.type !== ChannelType.GuildText) return false;
            // A. Marca de agua en el topic (Nuevo sistema)
            if (c.topic && c.topic.includes(member.id)) return true;
            // B. Nombre (Sistema antiguo)
            if (c.name.includes(`registro`) && c.name.includes(suffix)) return true;
            return false;
        });

        if (!hasChannel) {
            console.log(`✨ Creando canal para: ${member.user.tag}`);
            // Ejecutar sin await para no bloquear el bucle
            iniciarRegistro(member).catch(e => console.error(`❌ Fallo registro ${member.user.tag}:`, e.message));
            // Pequeña pausa para evitar Rate Limit
            await new Promise(r => setTimeout(r, 500)); 
        }
    }
}

module.exports = { sincronizarRegistros };