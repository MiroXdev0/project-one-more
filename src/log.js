export function log(message) {
    console.log(`[Schulorganizer] ${message}`);
}

export function logError(message, error = null) {
    console.error(
        `[Schulorganizer] ${message}`,
        error ?? ""
    );
}