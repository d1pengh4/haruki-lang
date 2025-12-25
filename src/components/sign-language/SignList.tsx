import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Hand, ChevronDown, ChevronUp, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { UseMutationResult } from '@tanstack/react-query';
// Assuming SignLanguage type is defined and can be imported
// import type { SignLanguage } from '@/types'; 

// A placeholder type for now
type SignLanguage = {
  id: string;
  name: string;
  thumbnail?: string;
  duration?: number;
};

interface SignListProps {
  signs: SignLanguage[];
  isLoading: boolean;
  error: Error | null;
  deleteMutation: UseMutationResult<void, Error, string, unknown>;
}

const SignItem = ({ sign, deleteMutation }: { sign: SignLanguage, deleteMutation: SignListProps['deleteMutation'] }) => (
  <div
    key={sign.id}
    className="group relative bg-card rounded-lg border-2 border-border hover:border-primary/50 transition-all overflow-hidden"
  >
    {sign.thumbnail ? (
      <img
        src={sign.thumbnail}
        alt={sign.name}
        className="w-full aspect-square object-cover"
      />
    ) : (
      <div className="w-full aspect-square bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
        <Hand className="w-12 h-12 text-primary/70" />
      </div>
    )}
    <div className="p-3">
      <p className="font-semibold text-center truncate text-card-foreground">{sign.name}</p>
      {sign.duration && (
        <p className="text-xs text-muted-foreground text-center mt-1">
          {sign.duration.toFixed(1)}초
        </p>
      )}
    </div>
    <Button
      size="icon"
      variant="destructive"
      className="absolute top-2 right-2 w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
      onClick={() => deleteMutation.mutate(sign.id)}
    >
      <Trash2 className="w-4 h-4" />
    </Button>
  </div>
);

const SignListContent = ({ signs, isLoading, error, deleteMutation, searchQuery }: SignListProps & { searchQuery: string }) => {
  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Hand className="w-16 h-16 mx-auto mb-4 opacity-30 animate-pulse" />
        <p>수화 데이터를 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">
        <Hand className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p>데이터를 불러오는 중 오류가 발생했습니다.</p>
        <p className="text-sm mt-2">{error.message}</p>
      </div>
    );
  }
  
  const filteredSigns = signs.filter(sign =>
    sign.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (signs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Hand className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p>아직 저장된 수화가 없습니다.</p>
        <p className="text-sm mt-2">학습 모드에서 새로운 수화를 추가해보세요!</p>
      </div>
    );
  }

  if (filteredSigns.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Search className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p>검색 결과가 없습니다.</p>
        <p className="text-sm mt-2">다른 검색어를 입력해보세요.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {filteredSigns.map((sign) => (
        <SignItem key={sign.id} sign={sign} deleteMutation={deleteMutation} />
      ))}
    </div>
  );
};

export default function SignList({ signs, isLoading, error, deleteMutation }: SignListProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <Card className="shadow-xl bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-card-foreground">
            <Hand className="w-5 h-5" />
            저장된 수화 ({signs.length})
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-muted-foreground"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                접기
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                펼치기
              </>
            )}
          </Button>
        </div>
        {isExpanded && (
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="수화 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-background/50"
            />
          </div>
        )}
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <SignListContent 
            signs={signs} 
            isLoading={isLoading}
            error={error}
            deleteMutation={deleteMutation}
            searchQuery={searchQuery}
          />
        </CardContent>
      )}
    </Card>
  );
}

