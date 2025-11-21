const { loadTribes, saveTribes } = require('./dataManager'); // IMPORTANTE
const { updateLog } = require('./logger');
const { EmbedBuilder } = require('discord.js');
const { loadGuildConfig } = require('./dataManager');
const { WARNING_POINTS, BAN_THRESHOLD } = require('./constants');

async function applyWarning(guild, targetType, targetId, warningType) {
    const tribes = loadTribes(guild.id);
    const points = WARNING_POINTS[warningType];
    let tribeName = null, member = null, isBanned = false;

    if (targetType === 'tribe') {
        tribeName = targetId;
        if (!tribes[tribeName]) return { success: false, message: 'Tribu no existe.' };
        
        tribes[tribeName].warnings = (tribes[tribeName].warnings || 0) + points;
        if (tribes[tribeName].warnings >= BAN_THRESHOLD) isBanned = true; // Lógica simplificada de ban
    } else {
        // Buscar usuario
        for (const t in tribes) {
            const m = tribes[t].members.find(x => x.discordId === targetId);
            if (m) { tribeName = t; member = m; break; }
        }
        if (!member) return { success: false, message: 'Usuario sin tribu.' };
        member.warnings = (member.warnings || 0) + points;
        if ((member.warnings + (tribes[tribeName].warnings || 0)) >= BAN_THRESHOLD) isBanned = true;
    }

    saveTribes(guild.id, tribes);
    await updateLog(guild, guild.client);
    return { success: true, message: `Warns aplicados.`, banned: isBanned };
}

async function removeWarning(guild, targetType, targetId, warningType) {
    const tribes = loadTribes(guild.id);
    const points = WARNING_POINTS[warningType];
    
    if (targetType === 'tribe') {
        if (!tribes[targetId]) return { success: false, message: 'No existe.' };
        tribes[targetId].warnings = Math.max(0, (tribes[targetId].warnings || 0) - points);
    } else {
        let member = null;
        for (const t in tribes) {
            member = tribes[t].members.find(x => x.discordId === targetId);
            if (member) break;
        }
        if (!member) return { success: false, message: 'Sin tribu.' };
        member.warnings = Math.max(0, (member.warnings || 0) - points);
    }

    saveTribes(guild.id, tribes);
    await updateLog(guild, guild.client);
    return { success: true, message: 'Warns removidos.' };
}

module.exports = { applyWarning, removeWarning };