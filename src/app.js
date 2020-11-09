const bodyParser = require('body-parser');
const express = require('express');
const { Op } = require('sequelize');
const { sequelize } = require('./model');
const { getProfile } = require('./middleware/getProfile');

const app = express();

app.use(bodyParser.json());
app.set('sequelize', sequelize);
app.set('models', sequelize.models);

app.get('/contracts/:id', getProfile, async (req, res) => {
  const { Contract } = req.app.get('models');
  const { id } = req.params;
  const currentProfileId = req.profile.id;

  const contract = await Contract.findOne({ where: { id, ClientId: currentProfileId } });

  if (!contract) return res.status(404).end();

  res.json(contract);
});

app.get('/contracts', getProfile, async (req, res) => {
  const { Contract } = req.app.get('models');
  const currentProfileId = req.profile.id;

  const contracts = await Contract.findAll({ where: { ClientId: currentProfileId }});

  if (!contracts) return res.status(404).end();

  res.json(contracts);
});

app.get('/jobs/unpaid', getProfile, async (req, res) => {
  const { Contract, Job } = req.app.get('models');
  const currentProfileId = req.profile.id;

  const jobs = await Job.findAll({
    include: {
      model: Contract,
      attributes: [],
      where: {
        [Op.or]: [
          { ClientId: currentProfileId },
          { ContractorId: currentProfileId },
        ],
      }
    },
    where: {
      paid: {
        [Op.not]: true,
      },
    }
  });

  if (!jobs) return res.status(404).end();

  res.json(jobs);
});

app.post('/jobs/:job_id/pay', getProfile, async (req, res) => {
  const { Contract, Job } = req.app.get('models');
  const currentProfile = req.profile;
  const jobId = req.params.job_id;

  const job = await Job.findOne({
    include: {
      model: Contract,
      attributes: [],
      where: {
        ClientId: currentProfile.id,
      }
    },
    where: {
      id: jobId,
      paid: {
        [Op.not]: true,
      },
    }
  });

  if (!job) return res.status(404).end();

  if (job.price > currentProfile.balance) {
    return res.status(405).send('Balance not suficient for this payment');
  }

  try {
    job.paymentDate = new Date();
    job.paid = true;

    await currentProfile.decrement({ balance: job.price });

    await job.save();
  } catch (e) {
    return res.status(500).send(e.toString());
  }

  res.json(job);
});

app.post('/balances/deposit/:userId', getProfile, async (req, res) => {
  const { Contract, Job, Profile } = req.app.get('models');
  const currentProfile = req.profile;
  const { userId } = req.params;
  const amount = req.get('amount');

  const jobs = await Job.findAll({
    include: {
      model: Contract,
      attributes: [],
      where: {
        ContractorId: currentProfile.id,
      }
    },
    where: {
      paid: {
        [Op.not]: true,
      },
    }
  });

  if (jobs && jobs.length > 0) {
    const totalAmountToPay = jobs.reduce((acc, job) => acc + job.price, 0);
    const allowedDepositAmount = totalAmountToPay * 0.25;

    if (amount > allowedDepositAmount) {
      return res.status(405).send('You can\'t deposit more than 25% of your total of jobs to pay');
    }
  }

  try {
    const receiver = await Profile.findOne({ id: userId });

    await receiver.increment({ balance: amount });
    await currentProfile.decrement({ balance: amount });
  } catch (e) {
    return res.status(500).send(e.toString());
  }

  res.json(currentProfile);
});

module.exports = app;
