const express = require('express');
const {
  createIntegrationHandlers,
  createNangoService,
  getNangoClient,
  isNangoConfigured,
} = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const nangoService = createNangoService({
  getClient: getNangoClient,
  findNangoConnectionByUserAndProvider: db.findNangoConnectionByUserAndProvider,
  listNangoConnectionsByUserId: db.listNangoConnectionsByUserId,
  listNangoConnectionsByTenantId: db.listNangoConnectionsByTenantId,
  upsertNangoConnection: db.upsertNangoConnection,
  deleteNangoConnectionByUserAndProvider: db.deleteNangoConnectionByUserAndProvider,
});

const handlers = createIntegrationHandlers({
  nangoService,
  isNangoConfigured,
});

router.use(requireJwtAuth);

router.get('/', handlers.listIntegrations);
router.get('/:providerKey/status', handlers.getProviderStatus);
router.get('/:providerKey/token', handlers.getProviderToken);
router.get('/:providerKey/connect-params', handlers.getConnectParams);
router.post('/:providerKey/confirm', handlers.confirmConnection);
router.delete('/:providerKey', handlers.disconnectProvider);

module.exports = router;
