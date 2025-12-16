const { getArkServers, getNitradoServers, getNitradoConfig } = require('./dataManager');
const { sendRconCommand } = require('./rconManager'); // Tu gestor RCON actual
const { sendNitradoCommand } = require('./nitradoManager'); // El gestor API que creamos antes

/**
 * Obtiene una lista unificada de TODOS los servidores (RCON + Nitrado)
 */
function getAllServers(guildId) {
    const rconServers = getArkServers(guildId).map(s => ({ ...s, type: 'RCON' }));
    const nitradoServers = getNitradoServers(guildId).map(s => ({ ...s, type: 'NITRADO' }));
    return [...rconServers, ...nitradoServers];
}

/**
 * Envía un comando al servidor elegido (o a todos si targetName es null)
 */
async function sendGlobalCommand(guildId, command, targetName = null) {
    const allServers = getAllServers(guildId);
    if (allServers.length === 0) return { success: false, message: 'No hay servidores configurados.' };

    // Filtrar si se especificó un nombre
    const targets = targetName 
        ? allServers.filter(s => s.server_name === targetName || s.name === targetName)
        : allServers;

    if (targets.length === 0) return { success: false, message: `Servidor "${targetName}" no encontrado.` };

    const results = [];

    // Ejecutar en paralelo
    await Promise.all(targets.map(async (server) => {
        let res;
        try {
            if (server.type === 'RCON') {
                // Usar tu función existente de RCON
                // Nota: sendRconCommand espera un ID, aquí lo llamamos directo
                res = await sendRconCommand(guildId, command, server.name); 
                // Tu sendRconCommand ya devuelve { server: name, success: ... }
                // pero como lo estamos llamando 1 a 1, adaptamos:
                if(res.rawResults && res.rawResults[0]) res = res.rawResults[0];
            } 
            else if (server.type === 'NITRADO') {
                // Usar la función de Nitrado
                const nitradoRes = await sendNitradoCommand(guildId, command, server.service_id);
                res = { 
                    server: server.server_name, 
                    success: nitradoRes.success, 
                    response: nitradoRes.message || (nitradoRes.success ? 'Comando enviado a API.' : 'Error API')
                };
            }
        } catch (e) {
            res = { server: server.name || server.server_name, success: false, message: e.message };
        }
        results.push(res);
    }));

    // Formatear respuesta combinada
    const output = results.map(r => `**[${r.server}]**: ${r.success ? '✅ ' + (r.response || 'Ok') : '❌ ' + (r.message || 'Error')}`).join('\n');
    return { success: true, message: output };
}

module.exports = { getAllServers, sendGlobalCommand };