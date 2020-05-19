var express = require('express');

var app = express();
var server = require('http').Server(app);
var io = require('socket.io').listen(server);

const ip = process.argv[2] || 'localhost';
// const ip = 'localhost';
const port = process.argv[3] || 3000;

// adding features:

// SERVER
// - add to game data structures
// - init in initGameStructures
// - emit the value in the connection socket

// CLIENT
// - listen for the socket

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/public/index.html');
});

// game data structures
var players, walls, bombs, globalPowerups, playersKilled, ipText;

const POSSIBLE_COLORS = new Set(['white', 'black', 'red', 'green']);
const Y_LENGTH = 11;
const X_LENGTH = 13;

const RANDOMIZATION_PERCENTAGE = 0.075;
const BOMB_LENGTH = 3; // seconds

const NO_POWERUP = 0;
const BOMB = 1;
const FIRE = 2;
const KICK = 3;
const DISEASE = 4;
const MULTI = 5;

const BOMB_COUNT = 10;
const FIRE_COUNT = 10;
const KICK_COUNT = 0; // normally 4
const DISEASE_COUNT = 14;
const MULTI_COUNT = 1;
//  NO_POWERUP_COUNT is difference between 93 and the random

const TOTAL_DISEASE_TYPE = 8;

const NO_DISEASE = 0;
const SUPER_SPEED = 1;
const SMALL_BOMBS = 2;
const REVERSED_DIRECTIONS = 3;
const SLOW_BOMBS = 4;
const NO_BOMBS = 5;
const SLOW_SPEED = 6;
const BOMB_POOPING = 7;
const FAST_BOMBS = 8;

const BASE_BOMB_COUNT = 1;
const BASE_EXPLOSION_LENGTH = 2;
const BASE_KICK_BOMB_COUNT = 0;
const BASE_MULTI_BOMB_COUNT = 0;

function initGameStructures() {
  players = {};
  walls = setupWallsAndPowerUps();
  bombs = {};
  globalPowerups = [];
  playersKilled = {};
  POSSIBLE_COLORS.forEach(function (color) {
    playersKilled[color] = false;
  });
  ipText = ip + ':' + port;
}

initGameStructures();

function getRandomDisease() {
  return Math.ceil(Math.random() * TOTAL_DISEASE_TYPE);
}

function getDiseaseLength(diseaseType) {
  switch (diseaseType) {
    case SUPER_SPEED:
      return 25;
    case SLOW_SPEED:
    case SLOW_BOMBS:
      return 20;
    case REVERSED_DIRECTIONS:
    case SMALL_BOMBS:
    case BOMB_POOPING:
    case FAST_BOMBS:
      return 15;
    case NO_BOMBS:
      return 12;
  }
}

function isPlayerSpace(x, y) {
  if ((x <= 2 || x >= X_LENGTH - 3) && (y <= 2 || y >= Y_LENGTH - 3)) {
    // corners
    const xIsCorner = x == 0 || x == X_LENGTH - 1;
    const yIsCorner = y == 0 || y == Y_LENGTH - 1;
    return xIsCorner || yIsCorner;
  } else if (x == Math.floor(X_LENGTH / 2)) {
    // middle spots
    const mid = Math.floor(Y_LENGTH / 2);
    return y <= mid + 2 && y >= mid - 2;
  }
  return false;
}

function isWallSpace(x, y) {
  // edge walls
  if (x < 0 || x >= X_LENGTH || y < 0 || y >= Y_LENGTH) {
    return true;
  }
  // mid walls
  if (y % 2 == 1 && x % 2 == 1) {
    return true;
  }
  return false;
}

/**
 * Shuffles array in place.
 * @param {Array} a items An array containing the items.
 */
function shuffle(a) {
  var j, x, i;
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
  return a;
}

function setupPowerUps(noPowerupCount) {
  let powerups = [];
  for (let i = 0; i < BOMB_COUNT; i++) {
    powerups.push(BOMB);
  }
  for (let i = 0; i < FIRE_COUNT; i++) {
    powerups.push(FIRE);
  }
  for (let i = 0; i < KICK_COUNT; i++) {
    powerups.push(KICK);
  }
  for (let i = 0; i < DISEASE_COUNT; i++) {
    powerups.push(DISEASE);
  }
  for (let i = 0; i < MULTI_COUNT; i++) {
    powerups.push(MULTI);
  }
  for (let i = 0; i < noPowerupCount; i++) {
    powerups.push(NO_POWERUP);
  }
  return shuffle(powerups);
}

function setupWallsAndPowerUps(powerups) {
  var wallPoints = [];
  for (let y = 0; y < Y_LENGTH; y++) {
    for (let x = 0; x < X_LENGTH; x++) {
      // don't put walls on top of the map squares
      if (isWallSpace(x, y) || isPlayerSpace(x, y)) {
        continue;
      }
      // only a certain percentage do not add walls
      if (Math.random() > RANDOMIZATION_PERCENTAGE) {
        wallPoints.push({ x, y });
      }
    }
  }
  wallPoints = shuffle(wallPoints);
  const noPowerupCount = Math.max(
    0,
    wallPoints.length - (BOMB_COUNT + FIRE_COUNT + KICK_COUNT + DISEASE_COUNT + MULTI_COUNT),
  );
  const shuffledPowerups = setupPowerUps(noPowerupCount);
  for (let i = 0; i < shuffledPowerups.length; i++) {
    if (!wallPoints[i]) {
      continue;
    }
    wallPoints[i].powerup = shuffledPowerups[i];
  }
  return wallPoints;
}

function S4() {
  return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
}

function generateId() {
  return S4() + S4() + '-' + S4() + '-' + S4() + '-' + S4() + '-' + S4() + S4() + S4();
}

function bombForXY(x, y, bombsToExplode) {
  if (
    Array.from(bombsToExplode).filter(function (bomb) {
      return bomb.x == x && bomb.y == y;
    }).length != 0
  ) {
    // we've already destroyed the bomb here
    return null;
  }
  return Object.keys(bombs).filter(function (bombId) {
    const bomb = bombs[bombId];
    return bomb.x == x && bomb.y == y;
  })[0];
}

function playerIdForXY(x, y) {
  return Object.keys(players).filter(function (playerId) {
    const player = players[playerId];
    return playerXToGridX(player.x) == x && playerYToGridY(player.y) == y;
  })[0];
}

function powerupForXY(x, y) {
  return globalPowerups.filter(function (powerup) {
    return powerup.x == x && powerup.y == y;
  })[0];
}

function searchForExplodables(
  x,
  y,
  maxDistance,
  powerUpsToDestroy,
  wallsToDestroy,
  playerIdsToKill,
  bombQueue,
  bombsToExplode,
  locationsToExplode,
  search,
) {
  stepCount = 1;
  while (stepCount <= maxDistance) {
    // debug
    // console.log('searching (' + x + ', ' + y + ')');
    if (isWallSpace(x, y)) {
      return;
    }
    // now that we know it's not a wall space, fire it
    locationsToExplode.add({ x, y });

    // if you destroy a wall, then we're done searching in this direction
    const destroyableWalls = walls.filter(function (wall) {
      return wall.x == x && wall.y == y;
    });
    if (destroyableWalls.length != 0) {
      // destroy it and stop searching
      wallsToDestroy.add(destroyableWalls[0]);
      return;
    }
    const powerupAtLocation = powerupForXY(x, y);
    // if you destroy a powerup, then we're done
    if (powerupAtLocation) {
      powerUpsToDestroy.add(powerupAtLocation);
      return;
    }
    const playerIdAtLocation = playerIdForXY(x, y);
    // if you destroy a player, then we keep searching in this direction
    if (playerIdAtLocation) {
      playerIdsToKill.add(playerIdAtLocation);
    }
    const bombAtLocation = bombForXY(x, y, bombsToExplode);
    // if you destroy a bomb, then we're done searching in this direction
    if (bombAtLocation) {
      // add it to queue
      bombQueue.push(bombAtLocation);
      return;
    } else {
      // keep searching
      const newPos = search(x, y);
      x = newPos.x;
      y = newPos.y;
      stepCount++;
    }
  }
}

function maybeExplodeBombs() {
  const currTime = new Date().getTime();
  // check if diseases need to expire
  let playersToRemoveDiseases = [];
  Object.keys(players).forEach(function (playerId) {
    if (players[playerId].disease && players[playerId].disease.expiration <= currTime) {
      players[playerId].disease = null;
      playersToRemoveDiseases.push(playerId);
    }
  });
  if (playersToRemoveDiseases.length > 0) {
    io.emit('removeDiseases', playersToRemoveDiseases);
  }

  // check all bombs if they need to explode
  let bombQueue = [];
  for (const bombId in bombs) {
    if (bombs.hasOwnProperty(bombId)) {
      const bomb = bombs[bombId];
      if (bomb.expiration <= currTime) {
        // ready to explode
        bombQueue.push(bombId);
      }
    }
  }
  if (bombQueue.length == 0) {
    return;
  }
  let powerUpsToDestroy = new Set();
  let bombsToExplode = new Set();
  let wallsToDestroy = new Set();
  let playerIdsToKill = new Set();
  let locationsToExplode = new Set();
  // explode, see other ones that should explode, explode them all
  while (bombQueue.length != 0) {
    const bombIdToExplode = bombQueue.shift();
    const currentBomb = bombs[bombIdToExplode];
    if (currentBomb == null) {
      // bomb was exploded already
      continue;
    }
    bombsToExplode.add(currentBomb);
    delete bombs[bombIdToExplode];

    // check north
    let x = currentBomb.x;
    let y = currentBomb.y - 1;
    let searchFunction = function (x, y) {
      y--;
      return { x, y };
    };
    searchForExplodables(
      x,
      y,
      currentBomb.length,
      powerUpsToDestroy,
      wallsToDestroy,
      playerIdsToKill,
      bombQueue,
      bombsToExplode,
      locationsToExplode,
      searchFunction,
    );
    // debug
    // console.log('walls after north');
    // console.log(wallsToDestroy);

    // check south
    x = currentBomb.x;
    y = currentBomb.y + 1;
    searchFunction = function (x, y) {
      y++;
      return { x, y };
    };
    searchForExplodables(
      x,
      y,
      currentBomb.length,
      powerUpsToDestroy,
      wallsToDestroy,
      playerIdsToKill,
      bombQueue,
      bombsToExplode,
      locationsToExplode,
      searchFunction,
    );
    // debug
    // console.log('walls after south');
    // console.log(wallsToDestroy);

    // check west
    x = currentBomb.x - 1;
    y = currentBomb.y;
    searchFunction = function (x, y) {
      x--;
      return { x, y };
    };
    searchForExplodables(
      x,
      y,
      currentBomb.length,
      powerUpsToDestroy,
      wallsToDestroy,
      playerIdsToKill,
      bombQueue,
      bombsToExplode,
      locationsToExplode,
      searchFunction,
    );
    // debug
    // console.log('walls after west');
    // console.log(wallsToDestroy);

    // check east
    x = currentBomb.x + 1;
    y = currentBomb.y;
    searchFunction = function (x, y) {
      x++;
      return { x, y };
    };
    searchForExplodables(
      x,
      y,
      currentBomb.length,
      powerUpsToDestroy,
      wallsToDestroy,
      playerIdsToKill,
      bombQueue,
      bombsToExplode,
      locationsToExplode,
      searchFunction,
    );
    // debug
    // console.log('walls after east');
    // console.log(wallsToDestroy);

    // check bomb location
    x = currentBomb.x;
    y = currentBomb.y;
    searchFunction = function (x, y) {
      // return an invalid location to just check current location
      return { x: -1, y: -1 };
    };
    searchForExplodables(
      x,
      y,
      currentBomb.length,
      powerUpsToDestroy,
      wallsToDestroy,
      playerIdsToKill,
      bombQueue,
      bombsToExplode,
      locationsToExplode,
      searchFunction,
    );
  }
  if (bombsToExplode.size != 0) {
    const bombIds = Array.from(bombsToExplode).map(function (bomb) {
      return bomb.id;
    });
    locationsToExplode = Array.from(locationsToExplode);
    // debug
    // console.log('destroying bombs');
    // console.log(bombIds);
    io.emit('bombsExploded', { bombIds, locationsToExplode });
  }

  if (powerUpsToDestroy.size != 0) {
    powerUpsToDestroy = Array.from(powerUpsToDestroy);
    for (let i = 0; i < powerUpsToDestroy.length; i++) {
      const powerupToDestroy = powerUpsToDestroy[i];
      const powerupIndex = globalPowerups.findIndex(function (currentPowerup) {
        return powerupToDestroy.x == currentPowerup.x && powerupToDestroy.y == currentPowerup.y;
      });
      if (powerupIndex >= 0) {
        globalPowerups.splice(powerupIndex, 1);
      }
    }
    io.emit('destroyPowerups', powerUpsToDestroy);
  }

  if (wallsToDestroy.size != 0) {
    // debug
    // console.log('destroying walls');
    // console.log(wallsToDestroy);
    wallsToDestroy = Array.from(wallsToDestroy);
    for (let i = 0; i < wallsToDestroy.length; i++) {
      const wallToDestroy = wallsToDestroy[i];
      const wallIndex = walls.findIndex(function (currentWall) {
        return wallToDestroy.x == currentWall.x && wallToDestroy.y == currentWall.y;
      });
      if (wallIndex >= 0) {
        walls.splice(wallIndex, 1);
        if (wallToDestroy.powerup != 0) {
          globalPowerups.push(wallToDestroy);
        }
      }
    }
    io.emit('wallsToDestroy', wallsToDestroy);
  }
  if (playerIdsToKill.size != 0) {
    // debug
    // console.log('killing players');
    // console.log(playerIdsToKill);
    playerIdsToKill = Array.from(playerIdsToKill);
    for (let i = 0; i < playerIdsToKill.length; i++) {
      const playerId = playerIdsToKill[i];
      players[playerId].alive = false;
      playersKilled[players[playerId].color] = true;
    }
    io.emit('playersKilled', playerIdsToKill);
    const alivePlayerIds = Object.keys(players).filter((playerId) => players[playerId].alive);
    if (alivePlayerIds.length <= 1) {
      io.emit('gameOver', alivePlayerIds[0]);
    }
  }
}

// bomb checks
setInterval(maybeExplodeBombs, 100);

function playerIndexToGridXY(color) {
  let x, y;
  switch (color) {
    case 'white':
      x = 0;
      y = 0;
      break;
    case 'black':
      x = 12;
      y = 10;
      break;
    case 'red':
      x = 12;
      y = 0;
      break;
    case 'green':
      x = 0;
      y = 10;
      break;
  }
  return { x, y };
}

function playerXToGridX(x) {
  return Math.round(x / 64 - 1.6);
}

function playerYToGridY(y) {
  return Math.round(y / 64 - 2.4);
}

function gridXToBombX(x) {
  return (x + 1.5) * 64;
}

function gridYToBombY(y) {
  return (y + 2.5) * 64;
}

// socket setup
io.on('connection', function (socket) {
  const playerCount = Object.keys(players).length;
  if (playerCount >= 4) {
    return;
  }

  const havePlayersBeenKilled =
    Object.keys(playersKilled).filter(function (color) {
      return playersKilled[color];
    }).length != 0;

  if (!havePlayersBeenKilled) {
    const playerColors = new Set(
      Object.keys(players).map(function (key, index) {
        return players[key].color;
      }),
    );
    const availableColors = [...POSSIBLE_COLORS].filter((x) => !playerColors.has(x));
    const playerColor = availableColors[0];
    const pos = playerIndexToGridXY(playerColor);

    // create a new player and add it to our players object
    players[socket.id] = {
      x: gridXToBombX(pos.x),
      y: gridYToBombY(pos.y),
      moving: 'stop',
      playerId: socket.id,

      color: playerColor,
      totalBombsPlaced: 0,

      // power ups
      bombCount: BASE_BOMB_COUNT,
      explosionLength: BASE_EXPLOSION_LENGTH,
      kickBomb: BASE_KICK_BOMB_COUNT,
      multiBomb: BASE_MULTI_BOMB_COUNT,
      disease: null,

      alive: true,
    };

    // update all other players of the new player
    socket.broadcast.emit('newPlayer', players[socket.id]);
  }

  // send the player and bombs to the new player
  socket.emit('currentPlayers', players);
  socket.emit('currentBombs', bombs);
  socket.emit('currentPowerups', globalPowerups);
  // send the walls to the new player
  socket.emit('wallsUpdated', walls);
  socket.emit('ipText', ipText);

  // when a player moves, update the player data
  socket.on('playerMovement', function (movementData) {
    if (!players[socket.id]) {
      return;
    }
    players[socket.id].x = movementData.x;
    players[socket.id].y = movementData.y;
    players[socket.id].moving = movementData.moving;
    // emit a message to all players about the player that moved
    socket.broadcast.emit('playerMoved', players[socket.id]);
  });

  socket.on('powerupPickedUp', function (powerupData) {
    if (!players[socket.id]) {
      return;
    }
    switch (powerupData.type) {
      case BOMB:
        players[socket.id].bombCount++;
        break;
      case FIRE:
        players[socket.id].explosionLength++;
        break;
      case KICK:
        players[socket.id].kickBomb++; // TODO implement
        break;
      case DISEASE:
        const diseaseType = getRandomDisease();
        const time = new Date().getTime();
        players[socket.id].disease = {
          type: diseaseType,
          expiration: time + getDiseaseLength(diseaseType) * 1000,
          start: time,
        };
        io.emit('newDisease', { id: socket.id, disease: players[socket.id].disease });
        break;
      case MULTI:
        players[socket.id].multiBomb++;
        break;
    }
    const index = globalPowerups.findIndex(function (currentPowerup) {
      return powerupData.x == currentPowerup.x && powerupData.y == currentPowerup.y;
    });
    if (index >= 0) {
      globalPowerups.splice(index, 1);
    }
    // emit a message to all players about the powerup gone that moved
    socket.broadcast.emit('destroyPowerups', [{ x: powerupData.x, y: powerupData.y }]);
  });

  socket.on('diseasedPlayerOverlap', function ({ otherPlayerId }) {
    // check valid players
    if (!players[socket.id] || !players[otherPlayerId]) {
      return;
    }
    const diseasedPlayer = players[socket.id];

    // check valid disease and that the other player doesn't have a disease
    if (!diseasedPlayer.disease || players[otherPlayerId].disease != null) {
      return;
    }

    const time = new Date().getTime();
    players[otherPlayerId].disease = {
      ...diseasedPlayer.disease,
      start: time,
    };
    io.emit('newDisease', { id: otherPlayerId, disease: players[otherPlayerId].disease });
  });

  // when wall is destroyed, update the walls data
  socket.on('bombPlaced', function (bombRequest) {
    if (!players[socket.id]) {
      return;
    }
    if (players[socket.id].disease && players[socket.id].disease.type == NO_BOMBS) {
      return;
    }
    let bombCountForPlayer = 0;
    for (const bombId in bombs) {
      if (bombs.hasOwnProperty(bombId)) {
        const bomb = bombs[bombId];
        if (bomb.owner == socket.id) {
          bombCountForPlayer++;
        }
        if (bomb.x == bombRequest.x && bomb.y == bombRequest.y) {
          // already bomb there
          // debug
          // console.log('bomb already here');
          return;
        }
      }
    }

    if (bombCountForPlayer >= players[socket.id].bombCount) {
      // too many bombs
      return;
    }

    let id = generateId();
    while (bombs[id] != null) {
      id = generateId();
    }

    let bombSpeedMultiplier = 1.0;
    if (!!players[socket.id].disease) {
      if (players[socket.id].disease.type == SLOW_BOMBS) {
        bombSpeedMultiplier = 2.0;
      } else if (players[socket.id].disease.type == FAST_BOMBS) {
        bombSpeedMultiplier = 0.5;
      }
    }

    let bomb = {
      id,
      x: bombRequest.x,
      y: bombRequest.y,
      expiration: new Date().getTime() + bombSpeedMultiplier * BOMB_LENGTH * 1000,
      length:
        players[socket.id].disease && players[socket.id].disease.type == SMALL_BOMBS
          ? 1
          : players[socket.id].explosionLength,
      owner: socket.id,
    };
    players[socket.id].totalBombsPlaced++;
    // debug
    // console.log('adding bomb to (' + bombRequest.x + ', ' + bombRequest.y + ') with bomb id ' + id);
    bombs[id] = bomb;
    // emit a message to all players about bomb placed
    socket.emit('bombsAdded', [bomb]);
    socket.broadcast.emit('bombsAdded', [bomb]);
  });

  // when wall is destroyed, update the walls data
  socket.on('multiBombPlaced', function (bombRequest) {
    if (!players[socket.id].multiBomb) {
      return;
    }
    if (players[socket.id].disease && players[socket.id].disease.type == NO_BOMBS) {
      return;
    }

    let bombCountForPlayer = 0;
    for (const bombId in bombs) {
      if (bombs.hasOwnProperty(bombId)) {
        const bomb = bombs[bombId];
        if (bomb.owner == socket.id) {
          bombCountForPlayer++;
        }
        if (bomb.x == bombRequest.x && bomb.y == bombRequest.y) {
          // already bomb there
          // debug
          // console.log('bomb already here');
          return;
        }
      }
    }

    if (bombCountForPlayer >= players[socket.id].bombCount) {
      // too many bombs
      return;
    }

    let maxNewBombCount = players[socket.id].bombCount - bombCountForPlayer;

    let dX = 0;
    let dY = 0;

    if (bombRequest.direction == 'down') {
      dY = 1;
    } else if (bombRequest.direction == 'up') {
      dY = -1;
    } else if (bombRequest.direction == 'left') {
      dX = -1;
    } else if (bombRequest.direction == 'right') {
      dX = 1;
    }

    let currentX = bombRequest.x;
    let currentY = bombRequest.y;

    let newBombs = [];

    for (let i = 0; i < maxNewBombCount; i++) {
      const destroyableWalls = walls.filter(function (wall) {
        return wall.x == currentX && wall.y == currentY;
      });

      if (
        isWallSpace(currentX, currentY) ||
        destroyableWalls.length != 0 ||
        (playerIdForXY(currentX, currentY) &&
          (currentX != bombRequest.x || currentY != bombRequest.y)) ||
        bombForXY(currentX, currentY, []) ||
        powerupForXY(currentX, currentY)
      ) {
        // done because we shouldn't place something here
        break;
      }

      let id = generateId();
      while (bombs[id] != null) {
        id = generateId();
      }

      let bomb = {
        id,
        x: currentX,
        y: currentY,
        expiration:
          new Date().getTime() +
          (players[socket.id].disease && players[socket.id].disease.type == SLOW_BOMBS
            ? 2 * BOMB_LENGTH
            : BOMB_LENGTH) *
            1000,
        length:
          players[socket.id].disease && players[socket.id].disease.type == SMALL_BOMBS
            ? 1
            : players[socket.id].explosionLength,
        owner: socket.id,
      };

      newBombs.push(bomb);

      players[socket.id].totalBombsPlaced++;
      bombs[id] = bomb;

      currentX += dX;
      currentY += dY;
    }

    // emit a message to all players about bomb placed
    socket.emit('bombsAdded', newBombs);
    socket.broadcast.emit('bombsAdded', newBombs);
  });

  socket.on('resetGame', function () {
    // remove this player from our players object
    initGameStructures();

    // send the player and bombs to the new player
    io.emit('currentPlayers', players);
    io.emit('currentBombs', bombs);
    io.emit('currentPowerups', globalPowerups);
    // send the walls to the new player
    io.emit('wallsUpdated', walls);
    io.emit('forceRefresh', true);
  });

  socket.on('disconnect', function () {
    // remove this player from our players object
    delete players[socket.id];
    // emit a message to all players to remove this player
    io.emit('disconnect', socket.id);
  });
});

server.listen(port, ip, function () {
  console.log(`Listening on ${ip}:${server.address().port}`);
});
