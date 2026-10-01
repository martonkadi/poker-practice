import { cardToText } from '@poker/contracts';
import type { Card } from '@poker/contracts';
import styles from '../styles.module.css';

export function CardFace({ card, hidden = false }: { card?: Card; hidden?: boolean }) {
  const text = card === undefined ? '' : cardToText(card);
  const suit = text[1];
  const symbol = suit === 'h' ? '♥' : suit === 'd' ? '♦' : suit === 's' ? '♠' : '♣';
  return <span className={`${styles.card} ${hidden ? styles.cardBack : ''} ${suit === 'h' || suit === 'd' ? styles.red : ''}`} aria-label={hidden ? 'Hidden card' : `${text[0]} ${symbol}`}>{hidden ? '✦' : <>{text[0]}<small>{symbol}</small></>}</span>;
}

export function Cards({ cards, hiddenCount = 0 }: { cards: readonly Card[]; hiddenCount?: number }) {
  return <span className={styles.cards}>{cards.map((c, i) => <CardFace card={c} key={`${c}-${i}`} />)}{Array.from({ length: hiddenCount }, (_, i) => <CardFace hidden key={`h-${i}`} />)}</span>;
}
