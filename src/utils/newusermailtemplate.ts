// @ts-nocheck
export function welcomeEmail(address: string) {
  return `<!DOCTYPE html>
  <html>
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Nerospace</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
          }
          .container {
              max-width: 600px;
              margin: 20px auto;
              background: #fff;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          }
          .header {
              text-align: center;
              color: #333;
          }
          .highlight {
              color: #6a0dad;
              font-weight: bold;
          }
          .button {
              display: block;
              width: 200px;
              text-align: center;
              background-color: #6a0dad;
              color: #fff;
              padding: 12px;
              margin: 20px auto;
              border-radius: 5px;
              text-decoration: none;
              font-weight: bold;
          }
          .footer {
              text-align: center;
              font-size: 12px;
              color: #777;
              margin-top: 20px;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <h2 class="header">You're In! 🎉</h2>
          <p>Hey <span class="highlight">${address}</span>,</p>
          <p>Welcome to <span class="highlight">Nerospace</span> – the world’s decentralized talent marketplace where skills meet opportunity.</p>
          <p>You’ve secured your place in the future of freelancing, where you can sell your <strong>gigs, talents, and digital items</strong>, all powered by <strong>Web3 technology and NeroCoin</strong>.</p>
          <a href="https://nerospace-one.vercel.app/" class="button">Invite Your Friends</a>
          <p>We’ll be in touch soon with exclusive updates. Stay tuned!</p>
          <div class="footer">&copy; 2025 Nerospace | All Rights Reserved</div>
      </div>
  </body>
  </html>`;
}
