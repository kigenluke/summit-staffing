const normalize = (abn) => {
  return String(abn || '')
    .replace(/[^0-9]/g, '')
    .trim();
};

const validateABN = (abn) => {
  const normalized = normalize(abn);
  return /^[0-9]{11}$/.test(normalized);
};

module.exports = {
  validateABN
};
