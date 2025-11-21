const { Events } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig } = require('../utils/dataManager'); // <--- ACTUALIZADO
const { updateLog } = require('../utils/logger');
const { iniciarRegistro } = require('./guildMemberAdd');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        if (newMember.user.bot) return;

        const guild = newMember.guild;
        
        // 1. Cargar Configuración
        const config = loadGuildConfig(guild.id);
        if (!config) return; // Si no hay config, no hacemos nada

        const unverifiedRole = guild.roles.cache.get(config.roles.unverified);
        const survivorRole = guild.roles.cache.get(config.roles.survivor);

        if (!unverifiedRole || !survivorRole) return;

        // ==================================================================
        // 1. SINCRONIZACIÓN: DETECTAR SI SE LE QUITÓ UN ROL DE TRIBU MANUALMENTE
        // ==================================================================
        const lostRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
        
        if (lostRoles.size > 0) {
            let tribes = loadTribes(guild.id); // <--- Carga local
            let jsonUpdated = false;

            for (const [roleId, role] of lostRoles) {
                const tName = role.name; // Asumimos Nombre Rol = Nombre Tribu

                if (tribes[tName]) {
                    console.log(`📉 Borrado manual rol tribu: "${tName}" a ${newMember.user.tag}`);
                    
                    const tribe = tribes[tName];
                    const memberIndex = tribe.members.findIndex(m => m.discordId === newMember.id);

                    if (memberIndex !== -1) {
                        tribe.members.splice(memberIndex, 1);
                        jsonUpdated = true;

                        // Si la tribu se vacía
                        if (tribe.members.length === 0) {
                            // Borrar Canal
                            if (tribe.channelId) {
                                const channel = guild.channels.cache.get(tribe.channelId);
                                if (channel) await channel.delete('Tribu vacía').catch(() => {});
                            }
                            // Borrar Rol
                            const tribeRole = guild.roles.cache.find(r => r.name === tName);
                            if (tribeRole) await tribeRole.delete('Tribu vacía').catch(() => {});

                            delete tribes[tName];
                        }
                    }
                }
            }

            if (jsonUpdated) {
                saveTribes(guild.id, tribes);
                await updateLog(guild, newMember.client);
            }
        }

        // ==================================================================
        // 2. INICIO DE REGISTRO MANUAL (Si un admin le pone "No Verificado")
        // ==================================================================
        const oldHasUnverified = oldMember.roles.cache.has(unverifiedRole.id);
        const newHasUnverified = newMember.roles.cache.has(unverifiedRole.id);
        const isInitialJoin = oldMember.roles.cache.size === 1;

        if (!oldHasUnverified && newHasUnverified) {
            if (isInitialJoin) return; 
            console.log(`👀 Registro manual iniciado para: ${newMember.user.tag}`);
            try { await iniciarRegistro(newMember); } catch (e) { console.error(e); }
            return; 
        }

        // ==================================================================
        // 3. POLICÍA DE TRIBUS (Superviviente sin tribu -> Reset)
        // ==================================================================
        const isSurvivor = newMember.roles.cache.has(survivorRole.id);
        const isAdmin = newMember.permissions.has('Administrator') || newMember.roles.cache.some(r => r.name === 'ADMIN');

        if (isSurvivor && !isAdmin) {
            const currentTribes = loadTribes(guild.id);
            const tribeNames = Object.keys(currentTribes);
            // Verificamos si tiene algún rol que coincida con una tribu registrada
            const hasTribeRole = newMember.roles.cache.some(r => tribeNames.includes(r.name));

            if (!hasTribeRole) {
                console.log(`📉 ALERTA: ${newMember.user.tag} es Superviviente sin tribu. Reseteando...`);
                
                const leaderRole = guild.roles.cache.get(config.roles.leader);
                const rolesToStrip = [survivorRole.id];
                
                if (leaderRole && newMember.roles.cache.has(leaderRole.id)) {
                    rolesToStrip.push(leaderRole.id);
                }
                
                try {
                    await newMember.roles.remove(rolesToStrip);
                    await iniciarRegistro(newMember); 
                } catch (e) { console.error(e); }
            }
        }
    },
};