export const hasReadWriteAccess = (accessLevel?: string): boolean => {
  const rawAccessLevel = String(accessLevel || '').trim().toLowerCase();
  if (!rawAccessLevel) {
    return false;
  }

  const numericAccessLevel = Number(rawAccessLevel);
  if (!Number.isNaN(numericAccessLevel)) {
    return (numericAccessLevel & 1) === 1 && (numericAccessLevel & 2) === 2;
  }

  const compactAccessLevel = rawAccessLevel.replace(/[^a-z]/g, '');
  if (compactAccessLevel === 'readwrite' || compactAccessLevel === 'currentreadcurrentwrite') {
    return true;
  }

  const accessTokens = rawAccessLevel.split(/[^a-z]+/).filter(Boolean);
  const hasRead = accessTokens.includes('read') || accessTokens.includes('currentread');
  const hasWrite = accessTokens.includes('write') || accessTokens.includes('currentwrite');
  return hasRead && hasWrite;
};
