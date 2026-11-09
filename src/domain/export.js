/** Create a versioned, read-only backup. A future importer must explicitly support this format. */
export function createGuestExport(habits, completions, exportedAt = new Date()) {
    return {
        format: 'auratrack-backup',
        version: 1,
        source: 'guest',
        exportedAt: exportedAt.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        data: { habits, completions },
    };
}

/** Keep each raw Firestore document, including duplicate or orphaned completions. */
export function createCloudExport(habitsSnapshot, completionsSnapshot, exportedAt = new Date()) {
    const records = snapshot => snapshot.docs.map(document => ({ id: document.id, data: document.data() }));
    return {
        format: 'auratrack-backup',
        version: 1,
        source: 'firebase',
        exportedAt: exportedAt.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        data: { habits: records(habitsSnapshot), completions: records(completionsSnapshot) },
    };
}

export function downloadExport(backup) {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const revoke = URL.revokeObjectURL.bind(URL);
    try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `auratrack-${backup.source}-${backup.exportedAt.slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    } finally {
        // Let the browser start the download before releasing the URL.
        setTimeout(() => revoke(url), 1000);
    }
}
