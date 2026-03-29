import React from "react";
import useEmblaCarousel from "embla-carousel-react";

export interface AlbumData {
  name: string;
  cover: string | null;
  count: number;
  lastUpdated: number;
}

interface AlbumGridProps {
  albums: AlbumData[];
  onSelect: (albumName: string) => void;
}

export function AlbumGrid({ albums, onSelect }: AlbumGridProps) {
  const [emblaRef] = useEmblaCarousel({
    loop: false,
    align: "start",
    dragFree: false,
    containScroll: "trimSnaps",
  });

  if (albums.length === 0) return null;

  // Pair albums into rows of 2 for the carousel pages
  const pages: AlbumData[][] = [];
  for (let i = 0; i < albums.length; i += 4) {
    pages.push(albums.slice(i, i + 4));
  }

  // If only a few albums, no need for carousel — just render the grid directly
  if (albums.length <= 4) {
    return (
      <div className="album-grid-static">
        {albums.map((album) => (
          <AlbumTile key={album.name} album={album} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  // More than 4 albums: use a swipeable carousel of pages
  return (
    <div className="album-carousel-wrap">
      <div className="embla album-embla" ref={emblaRef}>
        <div className="embla__container album-embla__container">
          {pages.map((page, idx) => (
            <div className="embla__slide album-embla__slide" key={idx}>
              <div className="album-grid-static">
                {page.map((album) => (
                  <AlbumTile key={album.name} album={album} onSelect={onSelect} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {pages.length > 1 && (
        <p className="album-swipe-hint">Swipe to see more albums</p>
      )}
    </div>
  );
}

function AlbumTile({ album, onSelect }: { album: AlbumData; onSelect: (name: string) => void }) {
  return (
    <button
      type="button"
      className={`album-tile${album.cover ? " album-tile--has-cover" : ""}`}
      onClick={() => onSelect(album.name)}
      style={album.cover ? { ["--album-cover" as string]: `url(${album.cover})` } : undefined}
    >
      <div className="album-tile-overlay" />
      <div className="album-tile-body">
        <span className="album-tile-name">{album.name}</span>
        <span className="album-tile-count">{album.count} {album.count === 1 ? "item" : "items"}</span>
      </div>
    </button>
  );
}
