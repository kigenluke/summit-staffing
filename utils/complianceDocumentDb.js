const { deleteFile } = require('../services/s3Service');

const replaceStaleComplianceUpload = async (pool, { table, subjectId, documentType }) => {
  const isParticipant = table === 'participant';
  const tableName = isParticipant ? 'participant_documents' : 'worker_documents';
  const subjectColumn = isParticipant ? 'participant_id' : 'worker_id';

  const staleRes = await pool.query(
    `SELECT id, file_url
     FROM ${tableName}
     WHERE ${subjectColumn} = $1
       AND document_type = $2
       AND status IN ('pending', 'rejected')`,
    [subjectId, documentType]
  );

  for (const row of staleRes.rows) {
    try {
      await deleteFile(row.file_url);
    } catch (_) {
      // Best-effort cleanup of replaced files.
    }
  }

  if (staleRes.rowCount > 0) {
    await pool.query(
      `DELETE FROM ${tableName}
       WHERE ${subjectColumn} = $1
         AND document_type = $2
         AND status IN ('pending', 'rejected')`,
      [subjectId, documentType]
    );
  }
};

module.exports = {
  replaceStaleComplianceUpload,
};
