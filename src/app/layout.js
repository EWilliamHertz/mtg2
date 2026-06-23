import './globals.css';

export const metadata = {
  title: 'MTG Online - Magic: The Gathering',
  description: 'Play Magic: The Gathering online - solo goldfish or 1v1 multiplayer',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
