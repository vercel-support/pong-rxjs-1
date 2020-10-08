import { interval, fromEvent, from, zip, Observable, range, timer, Subscription } from 'rxjs'
import { map, scan, filter, merge, flatMap, take, concat, takeUntil, timestamp} from 'rxjs/operators'

function pong() {
  class Move { constructor(public readonly n:number) {} }
  const canvas = document.getElementById('canvas')!;

  // The constants class contains all the required "constants" such 
  // as the width and height of paddles, canvas, ball etc.. set to readonly.
  // It prevents us from ever overriding it as well. 
  const Constants = new class {
      readonly CanvasWidth = 600
      readonly CanvasHeight = 600
      readonly PaddleStartSpeed = 3
      readonly PaddleHeight = 60
      readonly PaddleWidth = 10
      readonly PaddleInitialY = 275
      readonly PlayerInitialX = 50
      readonly AiInitialX = 550
      readonly BallInitialY = 300
      readonly BallInitialX = 300
      readonly BallInitialRadius = 8
      readonly BallStartVely = 0
      readonly BallStartVelx = 2
      readonly StartPoints = 0
      readonly WinningPoints = 7
      readonly PlayerWinText = "Player has won! "
      readonly AiWinText = "The AI has won! "

      // reboundVel helps calculate the velocity shift of the ball depending
      // on which side of the paddle it collides with, more in the report.
      readonly reboundVel = function(height: number, collisionY: number): number {
        const section = height/12
        const v =  collisionY >= 6*section && collisionY <= 7*section? 0
          : collisionY > section && collisionY < 12*section? 1
            : 2
        return collisionY <= height/2? -1*v: v
      }
    }
    
  // The different states is where we will base our html element attributes on,
  // it is Readonly because we do not even need to modify it, instead we pass it through
  // a stream which constantly returns a NEW state. More in the report!
  // ------------------------------------------------------------------- //
  // Paddle.vel is the value which determines how many y-pixels the paddle moves per stream
  // Paddle.pts is the score of the current paddle (either player or ai)
  type Paddle = Readonly <{
    id: string, y: number, x: number, w: number, h: number, vel: number, pts: number}>
  // Ball.vely and Ball.velx is similar to Paddle.vel
  // Ball.score lets the ball know when a player has scored a point
  type Ball = Readonly <{
    id: string, cy: number, cx: number, r: number, vely: number, velx: number, score: boolean }>
  type State = Readonly <{
    plyrPaddle: Paddle, aiPaddle: Paddle, ball: Ball, gameOver: boolean}> 
    
  // The initial states of player, ai, ball and a master state. The values of each attribute
  // are extracted from the Constants class to keep everything consistent
  // ------------------------------------------------------------------------------//
  // initialPlayer.vel is null because it does not require velocity since it is based on mouse event
  const initialPlayer: Paddle = {
    id: 'player', y: Constants.PaddleInitialY, x:Constants.PlayerInitialX, 
      w: Constants.PaddleWidth, h: Constants.PaddleHeight, vel: null, pts: Constants.StartPoints}
  const initialAi: Paddle = {
    id: 'ai', y: Constants.PaddleInitialY, x:Constants.AiInitialX, 
    w: Constants.PaddleWidth, h: Constants.PaddleHeight, vel: Constants.PaddleStartSpeed, pts: Constants.StartPoints }
  const initialBall: Ball = {
    id: 'ball', cy: Constants.BallInitialX, cx: Constants.BallInitialY, r: Constants.BallInitialRadius, 
    vely: Constants.BallStartVely, velx: Constants.BallStartVelx, score: false }
  const initialState: State = {
    plyrPaddle: initialPlayer, aiPaddle: initialAi, ball: initialBall, gameOver: false }

  // mouse$ reads the mouse event FROM the canvas ONLY. 
  // offsetY gives the position of the cursor relative to canvas
  const mouse$ = 
    fromEvent<MouseEvent>(canvas, 'mousemove')
      .pipe(
        map(({offsetY})=> new Move(offsetY) ) )
  
  // Function collisionBallBorder takes the overall state and computes the collision between
  // the ball and the borders, the physics of the velocity change is also implemented.
  // Whenever a paddle scores, resetting the ball to it's initial State is done here.
  // The general movement of the ball is also computed here.
  // It returns a new copy of the state with certain computed attributes being given new values.
  const collisionBallBorder = (s: State):State => {
    const p = s.plyrPaddle
    const a = s.aiPaddle
    const b = s.ball
    if (b.score) { 
      return {...s, ball: { ...initialBall,} } }
    return (b.cx >= Constants.CanvasWidth)?
      { ...s, 
        ball: { ...b,
                velx: (b.velx) * -1, vely: initialBall.vely,
                cy: b.cy - (b.vely), score: true },
        plyrPaddle: {...p, 
                pts: p.pts+1} } 
      : (b.cx <= 0)? 
      { ...s, 
        ball: { ...b,
                velx: (b.velx) * -1, vely: initialBall.vely,
                cy: b.cy - (b.vely), score: true },
        aiPaddle: {...a, 
                pts: a.pts+1} }
      : (b.cy >= Constants.CanvasHeight)? 
      { ...s, ball: { ...b,
        vely: Math.abs(b.vely) * -1, cy: b.cy - (b.vely) } }
      : (b.cy <= 0)? { ...s, ball: { ...b,
        vely: Math.abs(b.vely), cy: b.cy + (b.vely) } }
      : { ...s, ball: { ...b,
      cy: b.cy + b.vely , cx: b.cx + b.velx } }
    }

  // Function collisionBallPaddle takes the overall state and computes the collision between
  // the ball and paddles, the physics of the velocity change is also implemented.
  // Constants.reboundVel is called to adjust the speed of the ball depending on the different
  // sections of the paddle it collides with.
  // It returns a new copy of the state with certain computed attributes being given new values.
  const collisionBallPaddle = (s: State): State => {
    const
      p = s.plyrPaddle,
      a = s.aiPaddle,
      b = s.ball
      ;
    return ((b.cy+b.r) >= p.y && (b.cy-b.r) <= (p.y+p.h)) && ((b.cx-(b.r)) == p.x)? 
      { ...s, 
        ball: { ...b,
            velx: b.velx * -1,
            vely: s.ball.vely+Constants.reboundVel(p.h, (b.cy)-p.y)} } 
    : ((b.cy+b.r) >= a.y && (b.cy-b.r) <= (a.y+a.h)) && ((b.cx+(b.r/2)) == a.x)?
      { ...s, 
        ball: { ...b,
            velx: b.velx * -1,
            vely: s.ball.vely+Constants.reboundVel(a.h, b.cy-a.y)} }
    : {...s}
  }

  // Function aiMovement takes the overall state and computes the movement of the ai paddle.
  // The ai paddle will move towards the y-position of the ball by adding on its velocity attribute.
  // The ai only starts moving once the ball travels accross the dashed-line (represents midpoint of canvas)
  // The implementation of adding velocity and have it move only after midpoint is to avoid the aiPaddle being
  // too overpowered.
  // It returns a new copy of the state with certain computed attributes being given new values.
  const aiMovement = (s: State): State => {
    const
      a = s.aiPaddle,
      b = s.ball
      ;
      return b.cx>=Constants.CanvasWidth/2?  
        b.cy>(a.y+a.h/2)? 
          {...s, aiPaddle: {...a, y: a.y+a.vel}}:
          {...s, aiPaddle: {...a, y: a.y-a.vel}}
        : {...s}
  }

  // Function checkWin takes the overall state and determines whether someone has won.
  // It checks the current point of both paddles, if the player or ai has won, the gameOver attribute
  // is set to true.
  // If nobody has won, it returns the same copy of the state with gameOver set to false
  const checkWin = (s: State): State => {
    return s.plyrPaddle.pts >= Constants.WinningPoints||
     s.aiPaddle.pts >= Constants.WinningPoints? {...s, gameOver:true}:
     {...s, gameOver:false}
  }

  // Function doReset takes the overall state and reverts the state into its initialState. 
  // The return copy still has gameOver as true, this is so that the subscription is able to
  // still assess whether the game has ended. It will not bug out because function checkWin 
  // will automatically reset gameOver whenever points have been reset
  const doReset = (s: State): State => {
    return s.gameOver? {...initialState, gameOver: true}: {...s}
  }

  // Function stateReduction takes in a State and a Move and computes all necessary actions. 
  // Whenever the player moves the mouse in canvas, parameter e will receive a Move object which 
  // allows the playerPaddle to be moved accordingly. Constraints are set to not allow the paddle
  // to travel out of bounds.
  // When it is not detecting movement, stateReduction will execute non-player movements
  const stateReduction = (s: State, e: Move): State => {
    const p = s.plyrPaddle
    return e instanceof Move? 
      {...s, plyrPaddle: 
        {...p, y: e.n>=Constants.CanvasHeight-p.h? Constants.CanvasHeight-p.h : e.n<=0? 0: e.n} } 
      : (checkWin(aiMovement(collisionBallPaddle(collisionBallBorder(doReset({...s,}))))))
  }

  // updateGame is when we update all our html elements according to the computed States from stateReduction.
  // Here we allow the side effects and impurity of certain actions as all of it willbe contained within
  // a subscription. It also returns nothing
  const updateGame = (s: State): void => {
    const 
      p = s.plyrPaddle,
      a = s.aiPaddle,
      b = s.ball, 
      pSVG = document.getElementById(p.id),
      aSVG = document.getElementById(a.id),
      ballSVG = document.getElementById(b.id)!,
      score1SVG = document.getElementById('score1')!,
      score2SVG = document.getElementById('score2')!,
      historyUL = document.getElementById('history')!
      ;
    
    pSVG.setAttribute('y', String(p.y))
    aSVG.setAttribute('y', String(a.y))
    ballSVG.setAttribute('cy', String(b.cy))
    ballSVG.setAttribute('cx', String(b.cx))

    score1SVG.textContent = String(p.pts)
    score2SVG.textContent = String(a.pts)

    if(s.gameOver) {
      const li = document.createElement("li")
      li.setAttribute("id", p.pts==Constants.WinningPoints?"pwin":"awin")
      li.textContent =  p.pts==Constants.WinningPoints? 
      Constants.PlayerWinText + String(p.pts)+"-"+String(a.pts)
      :Constants.AiWinText + String(a.pts)+"-"+String(p.pts)
      historyUL.appendChild(li);
    }
  }

  // Game is the main stream where the game will be loaded
  // It merges mouse movement onto our stream, and utilizes scan to accumulate
  // the State so that we are able to pass on a newly computed state for updateGame
  // to modify the html values.
  const game = interval(5)
    .pipe(
      merge(mouse$),
      scan(stateReduction, initialState)
    ).subscribe(updateGame)

  }


  // the following simply runs your pong function on window load.  Make sure to leave it in place.
  if (typeof window != 'undefined')
    window.onload = ()=>{
      pong();
    }