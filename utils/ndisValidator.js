const normalize = (ndisNumber) => {
  return String(ndisNumber || '')
    .replace(/[^0-9]/g, '')
    .trim();
};

const validateNDISNumber = (ndisNumber) => {
  const normalized = normalize(ndisNumber);
  return /^43[0-9]{8}$/.test(normalized);
};

module.exports = {
  validateNDISNumber
};
