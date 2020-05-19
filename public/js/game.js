var config = null;
var game = null;

const DEBUG = false;

function initGame() {
  if (Phaser && config == null && game == null) {
    config = {
      type: Phaser.AUTO,
      parent: 'game',
      width: WIDTH,
      height: HEIGHT,
      physics: {
        default: 'arcade',
        arcade: {
          debug: DEBUG,
          gravity: { y: 0 },
        },
      },
      scene: {
        preload: preload,
        create: create,
        update: update,
      },
    };
    game = new Phaser.Game(config);
  } else {
    setTimeout(initGame, 500);
  }
}
setTimeout(initGame, 500);

const X_OFFSET = 1;
const Y_OFFSET = 2;

const NO_POWERUP = 0;
const BOMB = 1;
const FIRE = 2;
const KICK = 3;
const DISEASE = 4;
const MULTI = 5;

const NO_DISEASE = 0;
const SUPER_SPEED = 1;
const SMALL_BOMBS = 2;
const REVERSED_DIRECTIONS = 3;
const SLOW_BOMBS = 4;
const NO_BOMBS = 5;
const SLOW_SPEED = 6;
const BOMB_POOPING = 7;
const FAST_BOMBS = 8;

const ALIVE_SPRITE = 0;
const DEAD_SPRITE = 13;
const VICTORY_SPRITE = 25;

const PLAYER_INFO_OFFSET = 0;
const IP_TEXT_OFFSET = 385;

function preload() {
  this.load.image('tiles', 'assets/tilesets/bomberman1_battle01.bmp');

  this.load.image('bomb-powerup', 'assets/sprites/bomb-powerup.png');
  this.load.image('fire', 'assets/sprites/fire.png');
  this.load.image('disease', 'assets/sprites/disease.png');
  this.load.image('kick', 'assets/sprites/kick.png');
  this.load.image('multi', 'assets/sprites/multi.png');

  this.load.tilemapTiledJSON('map', 'assets/tilemaps/bomberman-map.json');

  this.load.spritesheet('white-dude', 'assets/sprites/white-sprites.png', {
    frameWidth: 30,
    frameHeight: 30,
  });
  this.load.spritesheet('black-dude', 'assets/sprites/black-sprites.png', {
    frameWidth: 30,
    frameHeight: 30,
  });
  this.load.spritesheet('red-dude', 'assets/sprites/red-sprites.png', {
    frameWidth: 30,
    frameHeight: 30,
  });
  this.load.spritesheet('green-dude', 'assets/sprites/green-sprites.png', {
    frameWidth: 30,
    frameHeight: 30,
  });

  this.load.spritesheet('bombs', 'assets/sprites/bombs.png', { frameWidth: 16, frameHeight: 16 });
  this.load.spritesheet('explosion', 'assets/sprites/explosion.png', {
    frameWidth: 100,
    frameHeight: 100,
  });

  this.colors = ['white', 'black', 'red', 'green'];

  // getLocalIpAddress().then((ip) => {
  //   this.ip = ip + ':8081';
  // });
}

function create() {
  var self = this;

  const map = this.make.tilemap({ key: 'map' });
  const tileset = map.addTilesetImage('bomberman1_battle01', 'tiles');

  const belowLayer = map.createStaticLayer('Below Player', tileset, 0, 0);
  const worldLayer = map.createStaticLayer('World', tileset, 0, 0);
  const bombableWallLayer = map.createDynamicLayer('Ground', tileset);

  this.ipText = this.add
    .text(0, 16, this.ip, {
      fill: 'white',
      backgroundColor: 'black',
      padding: 8,
    })
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', (e) => {
      copyTextToClipboard(this.ip);
    })
    .on('pointerover', function () {
      enterIPButtonHoverState(self);
    })
    .on('pointerout', function () {
      enterIPButtonRestState(self);
    });
  this.ipText.setTint(0xffffff);

  this.clickButton = this.add
    .text(848, 16, 'Reset Game', { fill: 'steelblue', backgroundColor: 'white', padding: 8 })
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', function () {
      resetGame(self);
    })
    .on('pointerover', function () {
      enterResetButtonHoverState(self);
    })
    .on('pointerout', function () {
      enterResetButtonRestState(self);
    });
  this.clickButton.setTint(0xffffff);

  // lolz stuff ---> 'red' needs this line in preload: this.load.image('red', 'assets/particles/red.png');
  // var particles = this.add.particles('red');

  // var emitter = particles.createEmitter({
  //   speed: 100,
  //   scale: { start: 1, end: 0 },
  //   blendMode: 'ADD',
  // });

  worldLayer.setCollisionByProperty({ collides: true });

  // debug for collision locations
  if (DEBUG) {
    const debugGraphics = this.add.graphics().setAlpha(0.75);
    worldLayer.renderDebug(debugGraphics, {
      tileColor: null, // Color of non-colliding tiles
      collidingTileColor: new Phaser.Display.Color(243, 134, 48, 255), // Color of colliding tiles
      faceColor: new Phaser.Display.Color(40, 39, 37, 255), // Color of colliding face edges
    });
  }

  // TODO draw top which has score and timer; see {{ image url }}

  this.bombs = this.physics.add.group();
  this.explosions = this.physics.add.staticGroup();

  setInterval(() => {
    destroyExplosions(this);
  }, 3000);

  this.powerups = this.physics.add.staticGroup();

  this.otherPlayers = this.physics.add.group();

  this.socket = io();

  this.socket.on('currentPlayers', function (players) {
    // remove all existing players
    let playersToKill = [];
    self.otherPlayers.getChildren().forEach(function (otherPlayer) {
      playersToKill.push(otherPlayer);
    });
    if (self.player && self.player.alive) {
      self.player.alive = false;
      self.player.anims.play(self.player.color + '-die', true);
    }
    for (let i = 0; i < playersToKill.length; i++) {
      playersToKill[i].destroy();
    }
    // getting initial player list
    Object.keys(players).forEach(function (id) {
      const player = players[id];
      if (!player.alive) {
        return;
      }
      if (player.playerId === self.socket.id) {
        addPlayer(self, player, worldLayer, bombableWallLayer);
      } else {
        addOtherPlayers(self, player);
      }
    });
  });

  this.socket.on('currentBombs', function (bombs) {
    // remove all existing bombs
    let bombsToKill = [];
    self.bombs.getChildren().forEach(function (otherBomb) {
      bombsToKill.push(otherBomb);
    });
    for (let i = 0; i < bombsToKill.length; i++) {
      bombsToKill[i].destroy();
    }
    // getting initial bomb list
    Object.keys(bombs).forEach(function (id) {
      addBombToCanvas(self, bombs[id]);
    });
  });

  this.socket.on('currentPowerups', function (powerups) {
    // remove all existing powerups
    let powerupsToKill = [];
    self.powerups.getChildren().forEach(function (otherPowerup) {
      powerupsToKill.push(otherPowerup);
    });
    for (let i = 0; i < powerupsToKill.length; i++) {
      powerupsToKill[i].destroy();
    }
    // getting initial bomb list
    Object.keys(powerups).forEach(function (id) {
      addPowerupToCanvas(self, powerups[id].powerup, powerups[id].x, powerups[id].y);
    });
  });

  this.socket.on('wallsUpdated', function (walls) {
    // getting initial wall list
    setUpBombableWalls(self, bombableWallLayer, walls);
  });

  this.socket.on('destroyPowerups', function (powerups) {
    let powerupsToDestroy = [];
    self.powerups.getChildren().forEach(function (otherPowerup) {
      let gridX = playerXToGridX(otherPowerup.x);
      let gridY = playerYToGridY(otherPowerup.y);
      if (
        powerups.filter(function (location) {
          return gridX == location.x && gridY == location.y;
        }).length != 0
      ) {
        powerupsToDestroy.push(otherPowerup);
      }
    });
    for (let i = 0; i < powerupsToDestroy.length; i++) {
      powerupsToDestroy[i].destroy();
    }
  });

  this.socket.on('newDisease', function ({ id, disease }) {
    const newDiseaseReceiverIsMe = self.player.playerId == id;
    let player;
    if (newDiseaseReceiverIsMe) {
      player = self.player;
    } else {
      player = self.otherPlayers.getChildren().find((otherPlayer) => otherPlayer.playerId == id);
    }
    if (player == null) {
      return;
    }

    player.disease = disease;
    if (player.diseaseFlicker) {
      clearInterval(player.diseaseFlicker);
      player.diseaseFlicker = 0;
      player.setTint(0xffffff);
    }
    if (newDiseaseReceiverIsMe) {
      setDiseaseText(self, disease);
    } else {
      player.diseaseFlicker = setInterval(() => {
        if (player.diseaseFlickerCounter) {
          player.diseaseFlickerCounter = false;
          player.setTint(0xffffff);
        } else {
          player.diseaseFlickerCounter = true;
          player.setTint(0x474133);
        }
      }, 300);
    }
  });

  this.socket.on('removeDiseases', function (playerIds) {
    playerIds.forEach((id) => {
      if (id == self.socket.id) {
        self.player.disease = null;
        self.player.hasDisease = false;
        removeDiseaseInfo(self);
      } else {
        const player = self.otherPlayers
          .getChildren()
          .find((otherPlayer) => otherPlayer.playerId == id);
        player.disease = null;
        player.hasDisease = false;
        if (player.diseaseFlicker) {
          clearInterval(player.diseaseFlicker);
          player.diseaseFlicker = 0;
          player.setTint(0xffffff);
        }
      }
    });
  });

  this.socket.on('bombsAdded', function (bombs) {
    bombs.forEach(function (newBomb) {
      addBombToCanvas(self, newBomb);
    });
  });

  this.socket.on('bombsExploded', function (data) {
    const bombIds = data.bombIds;
    const locationsToExplode = data.locationsToExplode;
    // iterate over all bomb sprites
    let bombsToDestroy = [];
    self.bombs.getChildren().forEach(function (otherBomb) {
      if (
        bombIds.find(function (id) {
          return id == otherBomb.id;
        }) != null
      ) {
        bombsToDestroy.push(otherBomb);
      }
    });
    for (let i = 0; i < bombsToDestroy.length; i++) {
      bombsToDestroy[i].destroy();
    }
    for (let i = 0; i < locationsToExplode.length; i++) {
      var explosionObject = self.explosions
        .create(
          gridXToBombX(locationsToExplode[i].x),
          gridYToBombY(locationsToExplode[i].y),
          'explosion',
        )
        .setOrigin(0.5, 0.5)
        .setDisplaySize(45, 45);

      explosionObject.destroyTime = new Date().getTime() + 550;

      explosionObject.anims.play('explosion', true);
      setTimeout(() => destroyExplosions(self), 600);
    }
  });

  this.socket.on('wallsToDestroy', function (walls) {
    // iterate over all walls
    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i];
      bombableWallLayer.removeTileAt(wall.x + X_OFFSET, wall.y + Y_OFFSET);
      if (wall.powerup != NO_POWERUP) {
        addPowerupToCanvas(self, wall.powerup, wall.x, wall.y);
      }
    }
  });

  this.socket.on('playersKilled', function (playerIds) {
    // iterate over all other player sprites
    let playersToKill = [];
    self.otherPlayers.getChildren().forEach(function (otherPlayer) {
      if (playerIds.find((id) => id == otherPlayer.playerId) != null) {
        playersToKill.push(otherPlayer);
      }
    });
    // check if you died
    if (
      playerIds.find(function (id) {
        return id == self.player.playerId;
      }) != null
    ) {
      self.player.alive = false;
      self.player.anims.play(self.player.color + '-die', true);
      if (self.gameOverPanel == null) {
        // leave up our party dude
        setPlayerSpriteInfo(self, DEAD_SPRITE);
      }
      setTimeout(function () {
        self.player.destroy();
      }, 4000);
    }
    for (let i = 0; i < playersToKill.length; i++) {
      playersToKill[i].alive = false;
      playersToKill[i].anims.play(playersToKill[i].color + '-die', true);
      let toBeKilled = playersToKill[i];
      setTimeout(function () {
        toBeKilled.destroy();
      }, 4000);
    }
  });

  this.socket.on('newPlayer', function (playerInfo) {
    addOtherPlayers(self, playerInfo);
  });

  this.socket.on('playerMoved', function (playerInfo) {
    self.otherPlayers.getChildren().forEach(function (otherPlayer) {
      if (playerInfo.playerId === otherPlayer.playerId) {
        // animate and updating position
        otherPlayer.anims.play(playerInfo.color + '-' + playerInfo.moving, true);
        otherPlayer.setPosition(playerInfo.x, playerInfo.y);
      }
    });
  });

  this.socket.on('ipText', function (ipText) {
    self.ip = ipText;
    self.ipText = self.add
      .text(IP_TEXT_OFFSET, 16, self.ip, {
        fill: 'white',
        backgroundColor: 'black',
        padding: 8,
      })
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (e) => {
        copyTextToClipboard(self.ip);
      })
      .on('pointerover', function () {
        enterIPButtonHoverState(self);
      })
      .on('pointerout', function () {
        enterIPButtonRestState(self);
      });
    self.ipText.setTint(0xffffff);
  });

  this.socket.on('disconnect', function (playerId) {
    self.otherPlayers.getChildren().forEach(function (otherPlayer) {
      if (playerId === otherPlayer.playerId) {
        otherPlayer.destroy();
      }
    });
  });

  this.socket.on('forceRefresh', function () {
    setTimeout(() => {
      // TODO message that we're resetting in 1 second
      window.location.reload(true);
    }, 1000);
  });

  this.socket.on('gameOver', function (winningPlayerId) {
    if (self.gameOverPanel) {
      // shouldn't be two game overs
      return;
    }
    let gameOverText =
      winningPlayerId == self.player.playerId ? '🥳🥳 You win!! 🥳🥳' : '😩 You lose... 😩';
    let leftOffset = winningPlayerId == self.player.playerId ? 15 : 50;
    if (winningPlayerId == null) {
      gameOverText = '😑 Draw... 😑';
      leftOffset = 140;
    }
    if (winningPlayerId == self.player.playerId) {
      setPlayerSpriteInfo(self, VICTORY_SPRITE);
    }
    self.gameOverPanel = self.add.text(leftOffset, 360, gameOverText, {
      fill: 'white',
      backgroundColor: 'black',
      padding: 40,
      fontSize: '80px',
    });
    self.gameOverPanel.setTint(0xffffff);
  });

  this.anims.create({
    key: 'bombs',
    frames: this.anims.generateFrameNumbers('bombs', { frames: [0, 1, 2, 1] }),
    frameRate: 3.5,
    repeat: -1,
  });

  this.anims.create({
    key: 'explosion',
    frames: this.anims.generateFrameNumbers('explosion', { start: 0, end: 75 }),
    frameRate: 600,
  });

  for (let i = 0; i < this.colors.length; i++) {
    const color = this.colors[i];

    this.anims.create({
      key: color + '-up',
      frames: this.anims.generateFrameNumbers(color + '-dude', { frames: [6, 8, 6, 7] }),
      frameRate: 3.5,
      repeat: -1,
    });

    this.anims.create({
      key: color + '-down',
      frames: this.anims.generateFrameNumbers(color + '-dude', { frames: [0, 1, 0, 2] }),
      frameRate: 3.5,
      repeat: -1,
    });

    this.anims.create({
      key: color + '-left',
      frames: this.anims.generateFrameNumbers(color + '-dude', { frames: [3, 5, 3, 4] }),
      frameRate: 3.5,
      repeat: -1,
    });

    this.anims.create({
      key: color + '-right',
      frames: this.anims.generateFrameNumbers(color + '-dude', { frames: [11, 9, 11, 10] }),
      frameRate: 3.5,
      repeat: -1,
    });

    this.anims.create({
      key: color + '-fast-up',
      frames: this.anims.generateFrameNumbers(color + '-dude', { frames: [6, 8, 6, 7] }),
      frameRate: 17.5,
      repeat: -1,
    });

    this.anims.create({
      key: color + '-fast-down',
      frames: this.anims.generateFrameNumbers(color + '-dude', { frames: [0, 1, 0, 2] }),
      frameRate: 17.5,
      repeat: -1,
    });

    this.anims.create({
      key: color + '-fast-left',
      frames: this.anims.generateFrameNumbers(color + '-dude', { frames: [3, 5, 3, 4] }),
      frameRate: 17.5,
      repeat: -1,
    });

    this.anims.create({
      key: color + '-fast-right',
      frames: this.anims.generateFrameNumbers(color + '-dude', { frames: [11, 9, 11, 10] }),
      frameRate: 17.5,
      repeat: -1,
    });

    this.anims.create({
      key: color + '-stop',
      frames: this.anims.generateFrameNumbers(color + '-dude', { start: 0, end: 0 }),
      frameRate: 10,
    });

    this.anims.create({
      key: color + '-die',
      frames: this.anims.generateFrameNumbers(color + '-dude', {
        frames: [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 16, 13, 17, 18, 19, 32],
      }),
      frameRate: 8,
    });
  }

  this.cursors = this.input.keyboard.createCursorKeys();
  this.spaceBar = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  this.mKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
  this.hKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H);
}

function update() {
  if (this.player && this.player.alive) {
    if (this.canPlaceBomb) {
      if (this.spaceBar.isDown) {
        placeBomb(this);
        this.canPlaceBomb = false;
      } else if (this.mKey.isDown) {
        placeMultiBomb(this);
        this.canPlaceBomb = false;
      }
    } else {
      if (
        !Phaser.Input.Keyboard.DownDuration(this.spaceBar, 500) &&
        !Phaser.Input.Keyboard.DownDuration(this.mKey, 500)
      ) {
        this.canPlaceBomb = true;
      }
    }
    var noHorizCursorsDown = false;
    var reverseDirection =
      this.player.disease && this.player.disease?.type == REVERSED_DIRECTIONS ? -1 : 1;
    var speed = 1;
    const superSpeed = this.player.disease?.type == SUPER_SPEED;
    if (this.player.disease) {
      if (superSpeed) {
        speed = 5;
      } else if (this.player.disease?.type == SLOW_SPEED) {
        speed = 0.5;
      }
    }
    var animPrefix = this.player.disease && superSpeed ? '-fast' : '';

    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-160 * reverseDirection * speed);
      this.player.anims.play(this.player.color + animPrefix + '-left', true);
      this.player.moving = 'left';
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(160 * reverseDirection * speed);
      this.player.anims.play(this.player.color + animPrefix + '-right', true);
      this.player.moving = 'right';
    } else {
      this.player.setVelocityX(0);
      // allows left / right animations to dominate
      noHorizCursorsDown = true;
    }

    if (this.cursors.up.isDown) {
      this.player.setVelocityY(-160 * reverseDirection * speed);
      if (noHorizCursorsDown) {
        this.player.anims.play(this.player.color + animPrefix + '-up', true);
        this.player.moving = 'up';
      }
    } else if (this.cursors.down.isDown) {
      this.player.setVelocityY(160 * reverseDirection * speed);
      if (noHorizCursorsDown) {
        this.player.anims.play(this.player.color + animPrefix + '-down', true);
        this.player.moving = 'down';
      }
    } else {
      this.player.setVelocityY(0);
      // no cursors at all
      if (noHorizCursorsDown) {
        this.player.anims.play(this.player.color + '-stop', true);
        if (this.player.moving != 'stop') {
          this.player.lastDirection = this.player.moving;
          this.player.moving = 'stop';
        }
      }
    }

    if (
      this.player.disease?.type == BOMB_POOPING &&
      this.player.disease?.start != null &&
      this.player.disease?.start + 300 < new Date().getTime()
    ) {
      placeBomb(this);
    }

    // prevent walking out of the world
    this.physics.world.wrap(this.player, 5);
    this.physics.world.setFPS(155);

    // emit player movement
    var x = this.player.x;
    var y = this.player.y;

    if (
      this.player.alive &&
      this.player.oldPosition &&
      (x !== this.player.oldPosition.x || y !== this.player.oldPosition.y)
    ) {
      // player is moving, detect moving direction and update the server
      this.socket.emit('playerMovement', { x, y, moving: this.player.moving });
    } else if (this.player.alive && this.player.moving != 'stop') {
      // player isn't moving but their animation is still moving, update server to stop animation
      let moving = 'stop';
      this.player.moving = moving;
      this.socket.emit('playerMovement', { x, y, moving });
    }

    this.player.oldPosition = { x, y };
  }

  // self.bombs.getChildren().forEach(otherBomb => {
  //   if (
  //     this.updateBombIds.find(function(id) {
  //       return id == otherBomb.id;
  //     }) != null
  //   ) {
  //     bombsToDestroy.push(otherBomb);
  //   }
  // });
  // for (let i = 0; i < bombsToDestroy.length; i++) {
  //   bombsToDestroy[i].destroy();
  // }
}

function placeBomb(self) {
  if (self.player.alive) {
    self.socket.emit('bombPlaced', {
      x: playerXToGridX(self.player.x),
      y: playerYToGridY(self.player.y),
    });
  }
}

function placeMultiBomb(self) {
  if (self.player.alive && self.player.multiBomb) {
    self.socket.emit('multiBombPlaced', {
      x: playerXToGridX(self.player.x),
      y: playerYToGridY(self.player.y),
      direction: self.player.moving != 'stop' ? self.player.moving : self.player.lastDirection,
    });
  }
}

function addBombToCanvas(self, bomb) {
  var bombObject = self.bombs
    .create(gridXToBombX(bomb.x), gridYToBombY(bomb.y), 'bombs')
    .setOrigin(0.5, 0.5)
    .setDisplaySize(45, 45);

  bombObject.body.setSize(20, 20);
  bombObject.body.setOffset(-2, -2);

  bombObject.id = bomb.id;
  bombObject.gridX = bomb.x;
  bombObject.gridY = bomb.y;
  bombObject.length = bomb.length;
  bombObject.owner = bomb.owner;

  bombObject.anims.play('bombs', true);
}

function mapPowerUpToSprite(powerup) {
  switch (powerup) {
    case 1:
      return 'bomb-powerup';
    case 2:
      return 'fire';
    case 3:
      return 'kick';
    case 4:
      return 'disease';
    case 5:
      return 'multi';
  }
}

function addPowerupToCanvas(self, powerup, x, y) {
  var powerupObject = self.powerups
    .create(gridXToBombX(x), gridYToBombY(y), mapPowerUpToSprite(powerup))
    .setOrigin(0.5, 0.5)
    .setDisplaySize(45, 45);
  powerupObject.body.setSize(45, 45);
  if (powerup == MULTI) {
    powerupObject.body.setOffset(50, 50);
  } else {
    powerupObject.body.setOffset(-5, -5);
  }
  powerupObject.type = powerup;
}

function kickedBomb(player, bomb) {
  // console.log('collision!');
  if (!player.kickBomb) {
    bomb.setPosition(gridXToBombX(bomb.gridX), gridYToBombY(bomb.gridY));
    bomb.setVelocityX(0);
    bomb.setVelocityY(0);
    player.set;
  } else {
  }
}

function playerOverlap(player, otherPlayer) {
  if (player.hasDisease) {
    // transmit to server about both players
    this.socket.emit('diseasedPlayerOverlap', {
      otherPlayerId: otherPlayer.playerId,
    });
  }
}

function checkPlayerOverlap(player, otherPlayer) {
  return player.hasDisease;
}

function pickUpPowerup(player, powerup) {
  powerup.destroy();

  switch (powerup.type) {
    case BOMB:
      this.player.bombCount++;
      break;
    case FIRE:
      this.player.explosionLength++;
      break;
    case KICK:
      this.player.kickBomb++; // TODO implement
      break;
    case DISEASE:
      this.player.hasDisease = true;
      break;
    case MULTI:
      this.player.multiBomb++;
      break;
  }

  this.socket.emit('powerupPickedUp', {
    x: playerXToGridX(powerup.x),
    y: playerYToGridY(powerup.y),
    type: powerup.type,
  });
}

function setPlayerSpriteInfo(self, spriteCode = ALIVE_SPRITE) {
  self.playerInfoText = self.add.text(PLAYER_INFO_OFFSET, 16, 'You are: ', {
    fill: 'white',
    backgroundColor: 'black',
    padding: 8,
  });
  self.playerInfoText.setTint(0xffffff);

  const sprite = self.add
    .sprite(PLAYER_INFO_OFFSET + 75, 16, self.player.color + '-dude', spriteCode)
    .setOrigin(0, 0.25)
    .setDisplaySize(74, 74);
  sprite.setTint(0xffffff);
}

function removeDiseaseInfo(self) {
  setDiseaseText(self, { type: NO_DISEASE });
}

function setDiseaseText(self, disease) {
  // clear existing disease
  if (self.diseaseText) {
    self.diseaseText.destroy();
    self.diseaseText = null;
  }
  if (self.player.diseaseFlicker) {
    clearInterval(self.player.diseaseFlicker);
    self.player.diseaseFlicker = 0;
    self.player.setTint(0xffffff);
  }

  if (disease?.type == NO_DISEASE) {
    return;
  }

  let newDiseaseText = '';
  switch (disease?.type) {
    case SUPER_SPEED:
      newDiseaseText = '⚡️';
      break;
    case SLOW_SPEED:
      newDiseaseText = '🐌';
      break;
    case SMALL_BOMBS:
      newDiseaseText = '🤏';
      break;
    case REVERSED_DIRECTIONS:
      newDiseaseText = '🔀';
      break;
    case SLOW_BOMBS:
      newDiseaseText = '⏱';
      break;
    case FAST_BOMBS:
      newDiseaseText = '🧨';
      break;
    case NO_BOMBS:
      newDiseaseText = '🚫';
      break;
    case BOMB_POOPING:
      newDiseaseText = '💩';
      break;
  }
  self.diseaseText = self.add.text(PLAYER_INFO_OFFSET + 130, 8, newDiseaseText, {
    fill: 'white',
    backgroundColor: 'black',
    padding: 8,
    fontSize: '36px',
  });
  self.diseaseText.setTint(0xffffff);
  self.player.diseaseFlicker = setInterval(() => {
    if (self.player.diseaseFlickerCounter) {
      self.player.diseaseFlickerCounter = false;
      self.player.setTint(0xffffff);
    } else {
      self.player.diseaseFlickerCounter = true;
      self.player.setTint(0x474133);
    }
  }, 300);
}

function addPlayer(self, playerInfo, worldLayer, bombableWallLayer) {
  self.player = self.physics.add
    .sprite(playerInfo.x, playerInfo.y, playerInfo.color + '-dude', 0)
    .setOrigin(0.5, 0.5)
    .setDisplaySize(74, 74);

  self.player.body.setSize(16, 19);
  self.player.body.setOffset(7, 6);

  self.player.playerId = playerInfo.playerId;
  self.player.moving = 'stop';
  self.player.color = playerInfo.color;
  setPlayerSpriteInfo(self);

  // power ups
  self.player.bombCount = playerInfo.bombCount;
  self.player.explosionLength = playerInfo.explosionLength;
  self.player.kickBomb = playerInfo.kickBomb;
  self.player.multiBomb = playerInfo.multiBomb;
  self.player.disease = playerInfo.disease;
  self.player.hasDisease = false;

  self.player.alive = true;
  self.player.lastDirection = 'down';

  self.player.setMaxVelocity(1500);
  self.player.setBounce(0.2);
  self.player.setCollideWorldBounds(true);

  self.physics.add.collider(self.player, worldLayer);
  self.physics.add.collider(self.player, bombableWallLayer);
  self.physics.add.collider(self.bombs, worldLayer);
  self.physics.add.collider(self.bombs, bombableWallLayer);
  // self.physics.add.collider(self.player, self.bombs);
  self.physics.add.collider(self.player, self.powerups, pickUpPowerup, null, self);
  self.physics.add.collider(self.player, self.bombs, kickedBomb, null, self);
  self.physics.add.overlap(self.player, self.otherPlayers, playerOverlap, checkPlayerOverlap, self);
}

function addOtherPlayers(self, playerInfo) {
  const otherPlayer = self.physics.add
    .sprite(playerInfo.x, playerInfo.y, playerInfo.color + '-dude', 0)
    .setOrigin(0.5, 0.5)
    .setDisplaySize(74, 74);

  otherPlayer.body.setSize(16, 19);
  otherPlayer.body.setOffset(7, 6);

  otherPlayer.playerId = playerInfo.playerId;
  otherPlayer.moving = playerInfo.moving;
  otherPlayer.color = playerInfo.color;
  self.otherPlayers.add(otherPlayer);
}

function setUpBombableWalls(self, bombableWallLayer, walls) {
  const existingTiles = bombableWallLayer.getTilesWithin();
  const tilesToDestroy = [];
  for (const key in existingTiles) {
    if (existingTiles.hasOwnProperty(key)) {
      const tile = existingTiles[key];
      if (tile.index == 9) {
        tilesToDestroy.push(tile);
      }
    }
  }
  for (let i = 0; i < tilesToDestroy.length; i++) {
    const tile = tilesToDestroy[i];
    bombableWallLayer.removeTileAt(tile.x, tile.y);
  }

  var tile;
  for (const index in walls) {
    if (walls.hasOwnProperty(index)) {
      const wall = walls[index];
      //                                   sprite, x, y
      tile = bombableWallLayer.putTileAt(9, wall.x + X_OFFSET, wall.y + Y_OFFSET);
      tile.setCollision(true);
    }
  }
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

function resetGame(self) {
  self.socket.emit('resetGame', {});
}

function enterResetButtonHoverState(self) {
  self.clickButton.setTint(0x40b2e4);
}

function enterResetButtonRestState(self) {
  self.clickButton.setTint(0xffffff);
}

function enterIPButtonHoverState(self) {
  self.ipText.setTint(0x40b2e4);
}

function enterIPButtonRestState(self) {
  self.ipText.setTint(0xffffff);
}

function destroyExplosions(self) {
  let explosionsToKill = [];
  self.explosions.getChildren().forEach(function (explosion) {
    if (explosion.destroyTime < new Date().getTime()) {
      explosionsToKill.push(explosion);
    }
  });
  for (let i = 0; i < explosionsToKill.length; i++) {
    explosionsToKill[i].destroy();
  }
}

// function getLocalIpAddress() {
//   return new Promise(function (resolve, reject) {
//     var RTCPeerConnection =
//       window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;

//     if (RTCPeerConnection) {
//       var rtc = new RTCPeerConnection({ iceServers: [] });

//       if (1 || window.mozRTCPeerConnection) {
//         // FF [and now Chrome!] needs a channel/stream to proceed
//         rtc.createDataChannel('', { reliable: false });
//       }

//       rtc.onicecandidate = function (evt) {
//         // convert the candidate to SDP so we can run it through our general parser
//         // see https://twitter.com/lancestout/status/525796175425720320 for details
//         if (evt.candidate) grepSDP('a=' + evt.candidate.candidate);
//       };

//       rtc.createOffer(
//         function (offerDesc) {
//           grepSDP(offerDesc.sdp);
//           rtc.setLocalDescription(offerDesc);
//         },
//         function (e) {
//           reject(new Error('WebRTC Offer Failed'));
//         },
//       );

//       var addrs = Object.create(null);

//       var INVALID_ADDR = '0.0.0.0';

//       addrs[INVALID_ADDR] = false;

//       function grepSDP(sdp) {
//         var hosts = [];
//         if (sdp) {
//           sdp.split('\r\n').forEach(function (line) {
//             // c.f. http://tools.ietf.org/html/rfc4566#page-39
//             if (~line.indexOf('a=candidate')) {
//               // http://tools.ietf.org/html/rfc4566#section-5.13
//               var parts = line.split(' '), // http://tools.ietf.org/html/rfc5245#section-15.1
//                 addr = parts[4],
//                 type = parts[7];
//               if (type === 'host' && addr !== INVALID_ADDR) {
//                 resolve(addr);
//               }
//             } else if (~line.indexOf('c=')) {
//               // http://tools.ietf.org/html/rfc4566#section-5.7
//               var parts = line.split(' '),
//                 addr = parts[2];
//               if (addr !== INVALID_ADDR) {
//                 resolve(addr);
//               }
//             }
//           });
//         }
//       }
//     } else {
//       reject(new Error('WebRTC not supported by this browser'));
//     }
//   });
// }

function fallbackCopyTextToClipboard(text) {
  var textArea = document.createElement('textarea');
  textArea.value = text;

  // Avoid scrolling to bottom
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.position = 'fixed';

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    var successful = document.execCommand('copy');
    var msg = successful ? 'successful' : 'unsuccessful';
  } catch (err) {
    console.error('Fallback: Oops, unable to copy', err);
  }

  document.body.removeChild(textArea);
}

function copyTextToClipboard(text) {
  if (!navigator.clipboard) {
    fallbackCopyTextToClipboard(text);
    return;
  }
  navigator.clipboard.writeText(text).then(
    function () {},
    function (err) {
      console.error('Async: Could not copy text: ', err);
    },
  );
}
