import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const BreedingPairs = () => {
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:4000/api/breeding-pairs")
      .then((res) => res.json())
      .then((data) => {
        setPairs(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load breeding pairs:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="grid gap-4">
      <h2 className="text-2xl font-bold">Breeding Pairs</h2>
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        pairs.map((pair, idx) => (
          <Card key={idx} className="p-4">
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-lg font-semibold">Mare: {pair.mare_name}</h3>
                <p>ID: {pair.mare_id}</p>
                <p>Reason: {pair.reason}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold">Stud: {pair.stud_name}</h3>
                <p>ID: {pair.stud_id}</p>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
};

export default BreedingPairs;