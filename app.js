const express = require("express");
const PORT = 8000;

const app = express();
app.use(express.json());

app.post(/(.*)/, async (req, res) => {
  res.send("Hello Send");
});

app.get(/(.*)/, async (req, res) => {
  res.send("Hello Get");
});

const startServer = () => {
  app.listen(PORT, () => {
    console.log(`Server is running at PORT ${PORT}`);
  });
};
startServer();

// `https://api.telegram.org/bots${Token}/${methosd}`
