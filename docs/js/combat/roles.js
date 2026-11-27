// Priorites tactiques des roles, sans dependance au navigateur.
export const AttackerSbireTargetPriority = {
    'gueux': ['gueux', 'tank', 'fantassin', 'mage'],
    'tank': ['gueux', 'tank', 'fantassin', 'mage'],
    'fantassin': ['gueux', 'tank', 'mage', 'fantassin'],
    'mage': ['gueux', 'fantassin', 'tank', 'mage']
};

export const AllySbireTargetPriority = {
    'gueux': ['gueux', 'tank', 'fantassin', 'mage'],
    'tank': ['tank', 'fantassin', 'mage', 'gueux'],
    'fantassin': ['tank', 'mage', 'fantassin', 'gueux'],
    'mage': ['fantassin','tank', 'mage', 'gueux']
};
