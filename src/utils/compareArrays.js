module.exports = (first, second, entityKey) => {
    const result = {added: [], removed: [], updated: []};

    first.forEach(firstItem => {
        const secondItem = second.find(x => x[entityKey] === firstItem[entityKey]);
        if (secondItem) {
            const hasChanges = Object.entries(firstItem).some(([key, value]) => {
                return value !== secondItem[key];
            });

            if (hasChanges) {
                result.updated.push(secondItem);
            }
        } else {
            result.removed.push(firstItem);
        }
    });

    const added = second.filter(secondItem => {
        return !first.some(x => x[entityKey] === secondItem[entityKey]);
    });
    result.added = added;

    return result;
};